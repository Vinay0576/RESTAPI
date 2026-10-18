-- Restrictive access baseline, not an implementation of all application RPCs.
begin;
set local lock_timeout = '5s';

-- This helper checks the real Auth session plus the application's device generation.
-- Bootstrap registration/login commands are a separately reviewed exception.
create function access_control.current_actor() returns uuid language sql stable security definer set search_path='' as $$
  select p.id from identity.profiles p
  join identity.session_bindings sb on sb.session_id::text = (auth.jwt()->>'session_id')
  join identity.device_bindings db on db.id=sb.device_binding_id and db.generation=sb.generation
  join identity.app_registrations ar on ar.id=db.registration_id and ar.profile_id=p.id and ar.revoked_at is null
  join auth.sessions s on s.id=sb.session_id and s.user_id=p.auth_user_id
  where (select auth.uid()) is not null and p.auth_user_id=(select auth.uid()) and p.deactivated_at is null
    and sb.revoked_at is null and sb.expires_at>statement_timestamp()
  limit 1
$$;

create function access_control.is_account_member(target_account uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from identity.memberships m join identity.accounts a on a.id=m.account_id
    join identity.app_registrations ar on ar.profile_id=m.profile_id
    join identity.device_bindings db on db.registration_id=ar.id
    join identity.session_bindings sb on sb.device_binding_id=db.id
    where m.account_id=target_account and m.profile_id=(select access_control.current_actor())
      and m.ended_at is null and a.archived_at is null and ar.revoked_at is null
      and sb.session_id::text=(auth.jwt()->>'session_id')
      and ((a.kind in ('customer_individual','customer_company') and ar.app='customer')
        or (a.kind='owner_fleet' and ar.app='partner' and ar.partner_role='owner')
        or (a.kind='operator_business' and ar.app='partner' and ar.partner_role='operator'))
  )
$$;

create function access_control.has_partner_role(required_role text) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from identity.session_bindings sb join identity.device_bindings db on db.id=sb.device_binding_id
    join identity.app_registrations ar on ar.id=db.registration_id
    where sb.session_id::text=(auth.jwt()->>'session_id') and ar.profile_id=(select access_control.current_actor())
      and ar.app='partner' and ar.partner_role=required_role and ar.revoked_at is null
  )
$$;

create function access_control.can_read_booking(target_booking uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from rentals.bookings b where b.id=target_booking and (
      access_control.is_account_member(b.customer_account_id) or access_control.is_account_member(b.supplier_account_id)
      or (access_control.has_partner_role('operator') and exists (select 1 from rentals.assignments a where a.booking_id=b.id
        and a.operator_id=(select access_control.current_actor()) and a.accepted_at is not null)
      )
    )
  )
$$;

-- No generic "is admin" policy silently grants every staff member every domain.
-- Scoped commands must resolve access_control.role_grants + role_capabilities and region.
do $$ declare s text; t record; begin
  foreach s in array array['identity','access_control','geography','catalogue','fleet','workforce','compliance','rentals','scheduling','logistics','finance','reputation','support','messaging','referrals','audit','rental_api'] loop
    execute format('revoke all on schema %I from public, anon, authenticated',s);
    execute format('revoke all on all tables in schema %I from public, anon, authenticated',s);
    execute format('revoke all on all sequences in schema %I from public, anon, authenticated',s);
    execute format('revoke all on all functions in schema %I from public, anon, authenticated',s);
    execute format('alter default privileges in schema %I revoke all on tables from public, anon, authenticated',s);
    execute format('alter default privileges in schema %I revoke all on sequences from public, anon, authenticated',s);
    execute format('alter default privileges in schema %I revoke execute on functions from public, anon, authenticated',s);
    execute format('grant usage on schema %I to service_role',s);
    execute format('grant select, insert, update, delete on all tables in schema %I to service_role',s);
    execute format('grant usage, select on all sequences in schema %I to service_role',s);
    for t in select tablename from pg_tables where schemaname=s loop
      execute format('alter table %I.%I enable row level security',s,t.tablename);
      execute format('alter table %I.%I force row level security',s,t.tablename);
    end loop;
  end loop;
end $$;
revoke all on schema db_extensions from public, anon, authenticated;
grant usage on schema access_control, identity, geography, catalogue, fleet, workforce, rentals, messaging to authenticated;
grant usage on schema catalogue, geography, finance to anon, authenticated;
grant execute on function access_control.current_actor(), access_control.is_account_member(uuid), access_control.can_read_booking(uuid), access_control.has_partner_role(text) to authenticated;

-- Safe reference data only. Archived values stay readable for historical interpretation.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='catalogue' loop
    execute format('grant select on catalogue.%I to anon, authenticated',t.tablename);
    execute format('create policy reference_read on catalogue.%I for select to anon, authenticated using (true)',t.tablename);
  end loop;
end $$;
grant select on geography.regions, finance.currencies to anon, authenticated;
create policy reference_read on geography.regions for select to anon, authenticated using (true);
create policy reference_read on finance.currencies for select to anon, authenticated using (true);

grant select on identity.profiles, identity.accounts, identity.memberships, geography.sites,
  fleet.machines, workforce.operators, rentals.customer_vehicles, rentals.bookings, rentals.operator_hires,
  messaging.notifications to authenticated;
-- Bootstrap self-profile read does not authorize access to any business account.
create policy own_profile_read on identity.profiles for select to authenticated
  using (auth_user_id=(select auth.uid()) and deactivated_at is null);
grant update(display_name,locale) on identity.profiles to authenticated;
create policy own_profile_update on identity.profiles for update to authenticated
  using (id=(select access_control.current_actor())) with check (id=(select access_control.current_actor()));
create policy own_membership_read on identity.memberships for select to authenticated using (profile_id=(select access_control.current_actor()));
create policy member_account_read on identity.accounts for select to authenticated using (access_control.is_account_member(id));
create policy member_site_read on geography.sites for select to authenticated using (access_control.is_account_member(account_id));
create policy owner_machine_read on fleet.machines for select to authenticated using (access_control.is_account_member(owner_account_id));
create policy own_work_profile on workforce.operators for select to authenticated using (profile_id=(select access_control.current_actor()));
create policy customer_vehicle_read on rentals.customer_vehicles for select to authenticated using (access_control.is_account_member(customer_account_id));
create policy participant_booking_read on rentals.bookings for select to authenticated using (access_control.can_read_booking(id));
create policy participant_hire_read on rentals.operator_hires for select to authenticated
  using (access_control.is_account_member(customer_account_id) or (operator_id=(select access_control.current_actor()) and access_control.has_partner_role('operator')));
create policy inbox_read on messaging.notifications for select to authenticated using (recipient_profile_id=(select access_control.current_actor()));
grant update(read_at) on messaging.notifications to authenticated;
create policy inbox_mark_read on messaging.notifications for update to authenticated
  using (recipient_profile_id=(select access_control.current_actor())) with check (recipient_profile_id=(select access_control.current_actor()));

-- Append-only tables are still trigger-protected for service_role; no TRUNCATE grant.
-- Backend RPCs are intentionally not granted by this proposal. Their full port is required before cutover.
commit;
