-- Fictitious local demo records. No production data or real credentials.
begin;
insert into auth.users(id) values ('90000000-0000-4000-8000-000000000001');
insert into identity.profiles(id,auth_user_id,display_name) values
 ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Local API Administrator');
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001"}',true);
insert into identity.profiles(id,display_name) values
 ('10000000-0000-4000-8000-000000000002','Demo Customer'),
 ('10000000-0000-4000-8000-000000000003','Demo Fleet Owner');
insert into finance.currencies(code,minor_unit_digits) values ('INR',2) on conflict(code) do nothing;
insert into geography.regions(code,parent_code,name,kind) values
 ('IN',null,'India','country'),('IN-TG','IN','Telangana','state'),('IN-TG-HYD','IN-TG','Hyderabad','city');
insert into catalogue.equipment_categories(code,name) values
 ('excavator','Excavator'),('backhoe','Backhoe Loader'),('crane','Crane');
insert into catalogue.manufacturers(id,name) values
 ('30000000-0000-4000-8000-000000000001','Demo Equipment Works'),
 ('30000000-0000-4000-8000-000000000002','Example Machinery');
insert into catalogue.models(id,manufacturer_id,category_code,name) values
 ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','excavator','Demo EX200');
insert into catalogue.attachment_categories(code,name) values ('bucket','Buckets');
insert into catalogue.attachments(id,category_code,name,weight_kg) values
 ('32000000-0000-4000-8000-000000000001','bucket','Demo General Purpose Bucket',500);
insert into identity.accounts(id,kind,legal_name) values
 ('20000000-0000-4000-8000-000000000001','owner_fleet','Demo Hyderabad Fleet'),
 ('20000000-0000-4000-8000-000000000002','customer_individual','Demo Customer Account');
insert into identity.memberships(account_id,profile_id,member_role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','owner'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner');
insert into geography.sites(id,account_id,label,address,region_code,latitude,longitude) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Demo yard','Fictitious yard, Hyderabad','IN-TG-HYD',17.440100,78.348900),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Demo work site','Fictitious site, Hyderabad','IN-TG-HYD',17.450000,78.380000);
insert into fleet.machines(id,owner_account_id,model_id,identification_number,yard_site_id,manufacture_year,lifetime_hours) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','DEMO-EX-001','40000000-0000-4000-8000-000000000001',2024,1200);
insert into fleet.machine_rate_versions(id,machine_id,version,billing_mode,rate_minor,effective_from) values
 ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,'day',1500000,now());
insert into rentals.bookings(id,customer_account_id,supplier_account_id,machine_id,request_key,starts_at,ends_at,mode) values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 8 hours','machine_only');
insert into finance.ledger_accounts(id,code,kind) values
 ('70000000-0000-4000-8000-000000000001','demo_cash','asset'),
 ('70000000-0000-4000-8000-000000000002','demo_equity','equity');
insert into messaging.outbox(id,event_key,event_type,payload) values
 ('80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','demo.seeded','{"demo":true}');
insert into messaging.notifications(id,recipient_profile_id,outbox_id,title,body) values
 ('82000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','Demo database ready','This notification is fictitious sample data.');
commit;
