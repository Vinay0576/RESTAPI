-- Privileged local data-administration API, not a customer-facing role.
begin;
create role equiprent_api login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant service_role to equiprent_api;
-- All API work uses SET LOCAL ROLE, and retains source integrity triggers.
do $$ declare s text; begin
  foreach s in array array['identity','access_control','geography','catalogue','fleet','workforce',
    'compliance','rentals','scheduling','logistics','finance','reputation','support','messaging','referrals','audit'] loop
    execute format('grant execute on all functions in schema %I to service_role', s);
  end loop;
end $$;
grant usage on schema db_extensions to service_role;
grant execute on all functions in schema db_extensions to service_role;
revoke create on schema public from public;
commit;
