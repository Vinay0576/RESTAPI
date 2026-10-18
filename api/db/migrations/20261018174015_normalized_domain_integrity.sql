-- Foundational integrity; full legacy workflow RPC port is a deployment prerequisite.
begin;
set local lock_timeout = '5s';

create function audit.stamp_row() returns trigger language plpgsql set search_path = '' as $$
declare actor uuid;
begin
  select id into actor from identity.profiles where auth_user_id = (select auth.uid()) and deactivated_at is null;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    if actor is not null then new.created_by := actor; end if;
  else
    if new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Creation audit fields are immutable' using errcode = '23514';
    end if;
  end if;
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := clock_timestamp();
    if actor is not null then new.updated_by := actor; end if;
  end if;
  return new;
end $$;

create function audit.reject_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Append-only evidence: insert a correction or reversal' using errcode = '23514';
end $$;

-- Do not make name/phone/catalogue values into independently mutable copies.
create function fleet.check_machine() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from identity.accounts a where a.id=new.owner_account_id and a.kind='owner_fleet') then
    raise exception 'Machine owner must be a fleet account' using errcode='23514';
  end if;
  if not exists (select 1 from geography.sites s where s.id=new.yard_site_id and s.account_id=new.owner_account_id) then
    raise exception 'Machine yard must belong to owner' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.owner_account_id<>old.owner_account_id then
    raise exception 'Ownership transfer requires a separately reviewed history model' using errcode='23514';
  end if;
  return new;
end $$;
create trigger machine_owner_guard before insert or update on fleet.machines for each row execute function fleet.check_machine();

create function rentals.check_booking() returns trigger language plpgsql set search_path = '' as $$
declare old_state text;
begin
  if not exists (select 1 from identity.accounts a where a.id=new.customer_account_id and a.kind in ('customer_individual','customer_company')) then
    raise exception 'Customer account required' using errcode='23514';
  end if;
  if not exists (select 1 from fleet.machines m where m.id=new.machine_id and m.owner_account_id=new.supplier_account_id) then
    raise exception 'Supplier must own booked machine' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if (new.customer_account_id,new.supplier_account_id,new.machine_id,new.request_key) is distinct from
       (old.customer_account_id,old.supplier_account_id,old.machine_id,old.request_key) then
      raise exception 'Booking identity is immutable' using errcode='23514';
    end if;
    old_state := old.state;
    if new.state<>old_state and not (
      (old_state='requested' and new.state in ('confirmed','cancelled','expired')) or
      (old_state='confirmed' and new.state in ('dispatched','cancelled','expired')) or
      (old_state='dispatched' and new.state in ('confirmed','on_site','cancelled')) or
      (old_state='on_site' and new.state in ('dispatched','in_use','cancelled')) or
      (old_state='in_use' and new.state in ('completed','cancelled'))
    ) then raise exception 'Invalid booking transition' using errcode='23514'; end if;
  elsif new.state<>'requested' then
    raise exception 'New booking starts requested' using errcode='23514';
  end if;
  return new;
end $$;
create trigger booking_guard before insert or update on rentals.bookings for each row execute function rentals.check_booking();

create function rentals.check_operator_hire() returns trigger language plpgsql set search_path = '' as $$
declare v rentals.customer_vehicles; r workforce.category_rate_versions; hours numeric;
begin
  select * into v from rentals.customer_vehicles where id=new.vehicle_id;
  select * into r from workforce.category_rate_versions where id=new.rate_version_id;
  if r.category_code is distinct from v.category_code or r.currency_code is distinct from new.currency_code then
    raise exception 'Rate category/currency does not match hire' using errcode='23514';
  end if;
  hours := extract(epoch from (new.ends_at-new.starts_at))/3600;
  if new.quoted_total_minor <> round(hours*r.customer_hour_minor) then
    raise exception 'Quote must match frozen hourly rate' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    if new.state<>'requested' or new.starts_at < clock_timestamp()+interval '150 minutes' then
      raise exception 'New request requires 150-minute lead time and requested state' using errcode='23514';
    end if;
    if new.expires_at > new.starts_at or new.expires_at <= clock_timestamp() then
      raise exception 'Invalid hire request expiry' using errcode='23514';
    end if;
  else
    if (to_jsonb(new)-array['state','updated_at','updated_by']) is distinct from
       (to_jsonb(old)-array['state','updated_at','updated_by']) then
      raise exception 'Hire terms are immutable; submit a new request' using errcode='23514';
    end if;
    if new.state<>old.state and not (
      (old.state='requested' and new.state in ('accepted','declined','cancelled','expired')) or
      (old.state='accepted' and new.state in ('completed','cancelled'))
    ) then raise exception 'Invalid operator hire transition' using errcode='23514'; end if;
    if new.state='accepted' and old.state<>'accepted' and old.expires_at<=clock_timestamp() then
      raise exception 'Request expired' using errcode='23514';
    end if;
    if new.state='completed' and new.ends_at>clock_timestamp() then
      raise exception 'Cannot complete before scheduled end' using errcode='23514';
    end if;
  end if;
  -- Ownership documents are intentionally NOT checked: they are optional for this product.
  return new;
end $$;
create trigger operator_hire_guard before insert or update on rentals.operator_hires for each row execute function rentals.check_operator_hire();

create function workforce.check_hire_eligibility() returns trigger language plpgsql set search_path = '' as $$
declare category text; needs_licence boolean;
begin
  if tg_op='UPDATE' and not (new.state='accepted' and old.state='requested') then return new; end if;
  select v.category_code,c.requires_licence into category,needs_licence
    from rentals.customer_vehicles v join catalogue.equipment_categories c on c.code=v.category_code where v.id=new.vehicle_id;
  if not exists (select 1 from identity.app_registrations a where a.profile_id=new.operator_id and a.app='partner' and a.partner_role='operator' and a.revoked_at is null) then
    raise exception 'Operator Partner membership required' using errcode='23514';
  end if;
  if not exists (
    select 1 from workforce.skill_claims c cross join lateral
      (select r.decision,r.valid_until from workforce.skill_reviews r where r.claim_id=c.id order by r.created_at desc,r.id desc limit 1) review
    where c.operator_id=new.operator_id and c.category_code=category and review.decision='approved'
      and (review.valid_until is null or review.valid_until>=new.ends_at)
  ) then raise exception 'Reviewed equipment skill required' using errcode='23514'; end if;
  if needs_licence and not exists (
    select 1 from compliance.documents d join compliance.licence_categories lc on lc.document_id=d.id
    cross join lateral (select r.decision from compliance.document_reviews r where r.document_id=d.id order by r.created_at desc,r.id desc limit 1) review
    where d.profile_id=new.operator_id and d.document_type='driving_licence' and lc.category_code=category
      and review.decision='verified' and d.expires_on >= (new.ends_at at time zone 'Asia/Kolkata')::date
  ) then raise exception 'Valid reviewed licence required' using errcode='23514'; end if;
  if not exists (select 1 from workforce.availability_sessions a where a.operator_id=new.operator_id and a.closed_at is null and a.available_from<=new.starts_at and a.available_until>=new.ends_at) then
    raise exception 'Availability does not cover requested work' using errcode='23514';
  end if;
  -- Travel distance/radius must be checked by the routing/matching command using the pinned site.
  return new;
end $$;
create trigger hire_eligibility before insert or update on rentals.operator_hires for each row execute function workforce.check_hire_eligibility();

create function rentals.check_assignment() returns trigger language plpgsql set search_path='' as $$
declare b rentals.bookings; chosen text;
begin
  select * into strict b from rentals.bookings where id=new.booking_id;
  select provider into chosen from rentals.staffing where booking_id=new.booking_id;
  if chosen is distinct from new.provider then raise exception 'Assignment differs from staffing decision' using errcode='23514'; end if;
  if new.provider='owner_roster' and not exists (
    select 1 from workforce.roster_memberships m where m.id=new.roster_membership_id and m.owner_account_id=b.supplier_account_id
      and m.operator_id=new.operator_id and m.state='active'
  ) then raise exception 'Active roster relationship required' using errcode='23514'; end if;
  if new.provider<>'owner_roster' and new.roster_membership_id is not null then
    raise exception 'Roster provenance applies only to roster assignments' using errcode='23514';
  end if;
  if new.provider='owner_self' and not exists (
    select 1 from identity.memberships m join identity.app_registrations ar on ar.profile_id=m.profile_id
    where m.account_id=b.supplier_account_id and m.profile_id=new.operator_id and m.member_role='owner' and m.ended_at is null
      and ar.app='partner' and ar.partner_role='owner' and ar.revoked_at is null
  ) then raise exception 'Self operator must own supplier account' using errcode='23514'; end if;
  if new.provider in ('owner_roster','platform') and not exists (
    select 1 from identity.app_registrations a where a.profile_id=new.operator_id and a.app='partner' and a.partner_role='operator' and a.revoked_at is null
  ) then raise exception 'Exclusive Partner operator role required' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.accepted_at is not null and
    (new.booking_id,new.operator_id,new.provider,new.payout_route,new.currency_code,new.agreed_wage_minor,new.accepted_at) is distinct from
    (old.booking_id,old.operator_id,old.provider,old.payout_route,old.currency_code,old.agreed_wage_minor,old.accepted_at) then
    raise exception 'Accepted assignment terms are immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger assignment_terms before insert or update on rentals.assignments for each row execute function rentals.check_assignment();

create function rentals.lock_staffing_provider() returns trigger language plpgsql set search_path='' as $$
begin
  if new.provider<>old.provider and exists (select 1 from rentals.assignments a where a.booking_id=old.booking_id and a.accepted_at is not null and a.state='accepted') then
    raise exception 'Accepted operator locks staffing provider' using errcode='23514';
  end if;
  return new;
end $$;
create trigger staffing_provider_guard before update on rentals.staffing for each row execute function rentals.lock_staffing_provider();

create function scheduling.check_reservation() returns trigger language plpgsql set search_path = '' as $$
declare res scheduling.resources; b rentals.bookings; h rentals.operator_hires; blk scheduling.blocks;
begin
  select * into strict res from scheduling.resources where id=new.resource_id;
  if new.booking_id is not null then
    select * into strict b from rentals.bookings where id=new.booking_id;
    if b.state in ('requested','expired') and new.released_at is null then
      raise exception 'Unconfirmed request cannot hold inventory' using errcode='23514';
    end if;
    if res.machine_id is not null and res.machine_id<>b.machine_id then
      raise exception 'Wrong machine for booking' using errcode='23514';
    end if;
    if res.operator_id is not null and not exists (select 1 from rentals.assignments a where a.booking_id=b.id and a.operator_id=res.operator_id and a.state in ('accepted','completed')) then
      raise exception 'Operator reservation needs accepted assignment' using errcode='23514';
    end if;
    if res.attachment_unit_id is not null and not exists (
      select 1 from fleet.attachment_units u join rentals.attachment_lines l on l.stock_id=u.stock_id
      where u.id=res.attachment_unit_id and l.booking_id=b.id
    ) then raise exception 'Unit is not in booked stock' using errcode='23514'; end if;
  elsif new.operator_hire_id is not null then
    select * into strict h from rentals.operator_hires where id=new.operator_hire_id;
    if res.operator_id is distinct from h.operator_id or h.state not in ('accepted','completed','cancelled') then
      raise exception 'Wrong operator or unaccepted hire reservation' using errcode='23514';
    end if;
  elsif new.block_id is not null then
    select * into strict blk from scheduling.blocks where id=new.block_id;
    if blk.resource_id<>new.resource_id then raise exception 'Wrong blocked resource' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger reservation_source_guard before insert or update on scheduling.reservations for each row execute function scheduling.check_reservation();

-- The projection is written in the SAME transaction as confirmation/acceptance.
-- GiST exclusion serializes contention across machine rentals and operator-only hires.
create function scheduling.reserve_confirmed_work() returns trigger language plpgsql set search_path='' as $$
declare resource uuid; b rentals.bookings;
begin
  if tg_table_name='bookings' and new.state='confirmed' and old.state='requested' then
    insert into scheduling.resources(machine_id) values(new.machine_id) on conflict(machine_id) do nothing;
    select id into resource from scheduling.resources where machine_id=new.machine_id;
    insert into scheduling.reservations(resource_id,booking_id,busy_during)
      values(resource,new.id,tstzrange(new.starts_at,new.ends_at,'[)'));
  elsif tg_table_name='operator_hires' and new.state='accepted' and old.state='requested' then
    insert into scheduling.resources(operator_id) values(new.operator_id) on conflict(operator_id) do nothing;
    select id into resource from scheduling.resources where operator_id=new.operator_id;
    insert into scheduling.reservations(resource_id,operator_hire_id,busy_during)
      values(resource,new.id,tstzrange(new.starts_at,new.ends_at,'[)'));
  elsif tg_table_name='assignments' and new.state='accepted' and (tg_op='INSERT' or old.state<>'accepted') then
    select * into strict b from rentals.bookings where id=new.booking_id;
    insert into scheduling.resources(operator_id) values(new.operator_id) on conflict(operator_id) do nothing;
    select id into resource from scheduling.resources where operator_id=new.operator_id;
    insert into scheduling.reservations(resource_id,booking_id,busy_during)
      values(resource,b.id,tstzrange(b.starts_at,b.ends_at,'[)'));
  end if;
  -- Release, rescheduling, travel/turnaround extension and custody clearance are command-owned.
  -- A terminal booking state alone intentionally does not release physical custody.
  return new;
end $$;
create trigger booking_reservation after update on rentals.bookings for each row execute function scheduling.reserve_confirmed_work();
create trigger hire_reservation after update on rentals.operator_hires for each row execute function scheduling.reserve_confirmed_work();
create trigger assignment_reservation after insert or update on rentals.assignments for each row execute function scheduling.reserve_confirmed_work();

-- A committed date change must move the reservation in the same transaction.
create function scheduling.check_booking_coverage() returns trigger language plpgsql set search_path='' as $$
declare b rentals.bookings;
begin
  select * into b from rentals.bookings where id=new.id;
  if b.state in ('confirmed','dispatched','on_site','in_use') and not exists (
    select 1 from scheduling.reservations r join scheduling.resources s on s.id=r.resource_id
    where r.booking_id=b.id and s.machine_id=b.machine_id and r.released_at is null
      and r.busy_during @> tstzrange(b.starts_at,b.ends_at,'[)')
  ) then raise exception 'Active booking must retain matching machine reservation' using errcode='23514'; end if;
  return null;
end $$;
create constraint trigger booking_coverage after insert or update on rentals.bookings
  deferrable initially deferred for each row execute function scheduling.check_booking_coverage();

create function finance.check_refund_cap() returns trigger language plpgsql set search_path = '' as $$
declare captured bigint; already_owed numeric;
begin
  if tg_op='UPDATE' and (new.capture_id,new.currency_code,new.amount_minor,new.request_key) is distinct from
      (old.capture_id,old.currency_code,old.amount_minor,old.request_key) then
    raise exception 'Refund amount/source are immutable' using errcode='23514';
  end if;
  select amount_minor into strict captured from finance.captures where id=new.capture_id for update;
  select coalesce(sum(amount_minor),0) into already_owed from finance.refunds
    where capture_id=new.capture_id and id<>new.id and state<>'cancelled';
  if new.state<>'cancelled' and already_owed+new.amount_minor>captured then
    raise exception 'Refunds exceed captured funds' using errcode='23514';
  end if;
  return new;
end $$;
create trigger refund_cap before insert or update on finance.refunds for each row execute function finance.check_refund_cap();

create function finance.check_attempt() returns trigger language plpgsql set search_path='' as $$
declare owed finance.obligations; collected numeric;
begin
  select * into strict owed from finance.obligations where id=new.obligation_id for update;
  if tg_op='INSERT' then
    select coalesce(sum(c.amount_minor),0) into collected from finance.captures c join finance.payment_attempts a on a.id=c.attempt_id where a.obligation_id=owed.id;
    if owed.voided_at is not null or new.amount_minor<>owed.amount_minor-collected then
      raise exception 'Checkout amount must equal unpaid obligation' using errcode='23514';
    end if;
    if new.expires_at>clock_timestamp()+interval '15 minutes' or new.expires_at<=clock_timestamp() then
      raise exception 'Checkout expires within fifteen minutes' using errcode='23514';
    end if;
  elsif (new.obligation_id,new.currency_code,new.amount_minor,new.provider,new.provider_order_id,new.request_key,new.expires_at) is distinct from
        (old.obligation_id,old.currency_code,old.amount_minor,old.provider,old.provider_order_id,old.request_key,old.expires_at) then
    raise exception 'Checkout identity/amount/expiry are immutable' using errcode='23514';
  end if;
  if exists (select 1 from finance.captures c where c.attempt_id=new.id) and new.state in ('failed','cancelled','expired') then
    raise exception 'Verified capture outranks late client checkout outcome' using errcode='23514';
  end if;
  return new;
end $$;
create trigger payment_attempt_guard before insert or update on finance.payment_attempts for each row execute function finance.check_attempt();

create function rentals.check_attachment_line() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists (select 1 from fleet.attachment_rate_versions r where r.id=new.rate_version_id and r.stock_id=new.stock_id) then
    raise exception 'Attachment rate belongs to another stock listing' using errcode='23514';
  end if;
  if not exists (select 1 from rentals.bookings b join fleet.attachment_stock s on s.owner_account_id=b.supplier_account_id where b.id=new.booking_id and s.id=new.stock_id) then
    raise exception 'Attachment supplier must match booking supplier' using errcode='23514';
  end if;
  return new;
end $$;
create trigger attachment_line_guard before insert on rentals.attachment_lines for each row execute function rentals.check_attachment_line();

create function logistics.check_attachment_movement() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists (select 1 from fleet.attachment_units u join rentals.attachment_lines l on l.stock_id=u.stock_id where u.id=new.unit_id and l.id=new.line_id) then
    raise exception 'Returned unit belongs to another attachment stock' using errcode='23514';
  end if;
  return new;
end $$;
create trigger attachment_movement_guard before insert on logistics.attachment_movements for each row execute function logistics.check_attachment_movement();

create view finance.booking_balances with (security_invoker=true) as
with latest_contract as (
  select distinct on (booking_id) id,booking_id,currency_code from finance.contracts order by booking_id,revision desc
), totals as (
  select c.booking_id,c.currency_code,coalesce(sum(l.amount_minor),0) as contracted_minor from latest_contract c left join finance.contract_lines l on l.contract_id=c.id group by c.booking_id,c.currency_code
), receipts as (
  select c.booking_id,sum(x.amount_minor) as collected_minor,min(x.verified_at) as first_verified_payment_at
  from finance.contracts c join finance.obligations o on o.contract_id=c.id
  join finance.payment_attempts a on a.obligation_id=o.id join finance.captures x on x.attempt_id=a.id
  group by c.booking_id
), refunds as (
  select c.booking_id,sum(r.amount_minor) as refunded_minor from finance.contracts c join finance.obligations o on o.contract_id=c.id
  join finance.payment_attempts a on a.obligation_id=o.id join finance.captures x on x.attempt_id=a.id
  join finance.refunds r on r.capture_id=x.id and r.state='succeeded' group by c.booking_id
)
select t.booking_id,t.currency_code,t.contracted_minor,coalesce(r.collected_minor,0) as collected_minor,
  coalesce(f.refunded_minor,0) as refunded_minor,r.first_verified_payment_at
from totals t left join receipts r on r.booking_id=t.booking_id left join refunds f on f.booking_id=t.booking_id;
comment on view finance.booking_balances is 'Read projection, not payable eligibility. Base-contract collections exclude overtime/damage/access and preserve the original verified payment clock; refunds do not reset it.';

create function finance.guard_journal_entry() returns trigger language plpgsql set search_path = '' as $$
declare transaction_id xid8;
begin
  select created_txid into strict transaction_id from finance.journals where id=new.journal_id for update;
  if transaction_id <> pg_current_xact_id() then
    raise exception 'Posted journal is sealed; create a reversing journal' using errcode='23514';
  end if;
  return new;
end $$;
create trigger entry_seal before insert on finance.entries for each row execute function finance.guard_journal_entry();

create function finance.check_journal_balance() returns trigger language plpgsql set search_path = '' as $$
declare entry_count bigint; balance numeric; journal_uuid uuid;
begin
  if tg_table_name='entries' then journal_uuid:=new.journal_id; else journal_uuid:=new.id; end if;
  select count(*),coalesce(sum(amount_minor),0) into entry_count,balance from finance.entries where journal_id=journal_uuid;
  if entry_count<2 or balance<>0 then raise exception 'Journal must have at least two balanced entries' using errcode='23514'; end if;
  return null;
end $$;
create constraint trigger journal_balanced after insert on finance.journals
  deferrable initially deferred for each row execute function finance.check_journal_balance();
create constraint trigger entries_balanced after insert on finance.entries
  deferrable initially deferred for each row execute function finance.check_journal_balance();

-- FK indexing: leading columns, non-partial B-tree coverage, not simply "column appears somewhere".
do $$ declare fk record; cols text; begin
  for fk in
    select c.oid,c.conrelid,c.conkey,n.nspname,t.relname from pg_constraint c
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and n.nspname=any(array['identity','access_control','geography','catalogue','fleet','workforce','compliance','rentals','scheduling','logistics','finance','reputation','support','messaging','referrals','audit'])
    and not exists (
      select 1 from pg_index i join pg_class ix on ix.oid=i.indexrelid join pg_am am on am.oid=ix.relam
      where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and am.amname='btree'
      and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] =
          array(select x from unnest(c.conkey) x)
    )
  loop
    select string_agg(quote_ident(a.attname),', ' order by k.ord) into cols
    from unnest(fk.conkey) with ordinality k(attnum,ord)
    join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.attnum;
    execute format('create index %I on %I.%I (%s)', 'fk_'||left(fk.relname,38)||'_'||left(md5(cols),12), fk.nspname,fk.relname,cols);
  end loop;
end $$;

-- Install audit/immutability by explicit table lists generated from the dictionary.
-- MODE_TRIGGERS (filled by build_model.py)
create trigger z_stamp_row before insert or update on identity.profiles for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.accounts for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.memberships for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.app_registrations for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.customer_login_links for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.device_bindings for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.session_bindings for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on identity.consents for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on identity.consents for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on identity.phone_session_proofs for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on geography.regions for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on geography.sites for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on access_control.roles for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on access_control.capabilities for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on access_control.role_capabilities for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on access_control.role_grants for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.equipment_categories for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.manufacturers for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.manufacturer_aliases for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.models for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.variants for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.attachment_categories for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.attachments for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on catalogue.compatibility_rules for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on catalogue.compatibility_rules for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on catalogue.compatibility_policies for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on catalogue.compatibility_policies for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on fleet.machines for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.machine_spec_overrides for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.machine_photos for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.machine_rate_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on fleet.machine_rate_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on fleet.attachment_stock for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.attachment_units for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.attachment_rate_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on fleet.attachment_rate_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on fleet.included_attachments for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on fleet.onboarding_rule_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on fleet.onboarding_rule_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on workforce.operators for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on workforce.skill_claims for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on workforce.skill_reviews for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on workforce.skill_reviews for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on workforce.roster_memberships for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on workforce.roster_invitations for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on workforce.availability_sessions for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on workforce.category_rate_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on workforce.category_rate_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on compliance.documents for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on compliance.documents for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on compliance.document_reviews for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on compliance.document_reviews for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on compliance.licence_categories for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on compliance.licence_categories for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on compliance.identity_cases for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.customer_vehicles for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.nominated_operators for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.requests for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.request_attachments for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.offers for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.bookings for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.site_snapshots for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.site_snapshots for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.operator_nominations for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.operator_nominations for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.verification_links for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.verification_links for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.party_snapshots for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.party_snapshots for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.attachment_lines for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.attachment_lines for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.staffing for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.assignments for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.operator_hires for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.lifecycle_events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on rentals.lifecycle_events for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on rentals.schedule_changes for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.overtime for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.incidents for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on rentals.work_sessions for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.resources for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.blocks for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.checkout_holds for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.reservations for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.match_searches for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on scheduling.match_attempts for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on scheduling.match_attempts for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.custody_events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.custody_events for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.challenges for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on logistics.condition_reports for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.condition_reports for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.condition_photos for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.condition_photos for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.attachment_movements for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.attachment_movements for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.pickup_checks for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.pickup_checks for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.positions for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on logistics.tariff_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.tariff_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.quotes for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.quotes for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on logistics.booking_quotes for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on logistics.booking_quotes for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.currencies for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.policy_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.policy_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.contracts for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.contracts for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.contract_lines for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.contract_lines for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.invoices for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.invoices for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.obligations for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.payment_attempts for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.payment_events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.payment_events for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.captures for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.captures for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.refunds for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.payee_profiles for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.payouts for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.payout_tax_lines for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.payout_tax_lines for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.payout_events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.payout_events for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.wage_adjustments for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.wage_adjustments for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.wage_receipts for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.wage_receipts for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.wage_acknowledgements for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.wage_acknowledgements for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.deposit_events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.deposit_events for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.access_plan_versions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.access_plan_versions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.access_purchases for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.access_purchases for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.access_entitlements for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.ledger_accounts for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on finance.journals for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.journals for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on finance.entries for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on finance.entries for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on reputation.reviews for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on reputation.scores for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on reputation.responses for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on reputation.reports for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on reputation.favorites for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.cases for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.damage_details for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.payout_holds for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.conversations for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.messages for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on support.messages for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on support.agent_presence for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on support.app_feedback for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on support.app_feedback for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on messaging.outbox for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on messaging.notifications for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on messaging.push_devices for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on referrals.codes for each row execute function audit.stamp_row();
create trigger z_stamp_row before insert or update on referrals.intents for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on referrals.intents for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on referrals.attributions for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on referrals.attributions for each row execute function audit.reject_mutation();
create trigger z_stamp_row before insert or update on audit.events for each row execute function audit.stamp_row();
create trigger a_append_only before update or delete on audit.events for each row execute function audit.reject_mutation();

revoke all on all functions in schema audit, fleet, rentals, scheduling, finance from public, anon, authenticated;
commit;
