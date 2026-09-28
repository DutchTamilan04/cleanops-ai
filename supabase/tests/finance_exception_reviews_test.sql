begin;
set local search_path=public,extensions;
select plan(21);

select results_eq($$select relrowsecurity from pg_class where oid='public.finance_exception_reviews'::regclass$$,
  array[true], 'finance reviews enforce RLS');
select results_eq($$select relrowsecurity from pg_class where oid='public.finance_exception_review_events'::regclass$$,
  array[true], 'finance review history enforces RLS');
select ok(not has_table_privilege('anon','public.finance_exception_reviews','select'),
  'anonymous cannot read finance reviews');
select ok(not has_table_privilege('authenticated','public.finance_exception_reviews','delete'),
  'browser roles cannot erase review state');
select ok(not has_table_privilege('authenticated','public.finance_exception_review_events','insert'),
  'browser roles cannot forge review history');

insert into auth.users (id,email,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000007','operations-finance-test@cleanops.example','{}');
insert into public.memberships (id,organization_id,user_id,role) values
  ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000007','operations_manager');
insert into public.member_site_access (id,organization_id,membership_id,site_id,starts_at) values
  ('41000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000001',
   '2026-01-01T00:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,note,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-09-01','revenue-variance-v1','site','40000000-0000-4000-8000-000000000001',
  'open','Review source','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006');
select is((select owner_user_id from public.finance_exception_reviews
  where rule_id='revenue-variance-v1'), '00000000-0000-4000-8000-000000000001'::uuid,
  'owner is derived from the authenticated reviewer, not the submitted value');
select is((select count(*) from public.finance_exception_review_events),1::bigint,
  'initial review event is appended');
update public.finance_exception_reviews set state='resolved',note='Verified accounting source'
where rule_id='revenue-variance-v1';
select is((select count(*) from public.finance_exception_review_events),2::bigint,
  'status change appends a second history event');
select throws_ok($$update public.finance_exception_reviews
  set site_id='40000000-0000-4000-8000-000000000002'
  where rule_id='revenue-variance-v1'$$,
  'P0001','Review source and scope are immutable','review cannot be moved to another site');
select throws_ok($$insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-09-01','repeat-repair-v1','equipment_asset','40000000-0000-4000-8000-000000000002',
  'open','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')$$,
  'P0001','Review source is not at the selected finance site',
  'a guessed or wrong-site source is rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select throws_ok($$insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-09-01','unmatched-cost-v1','site','40000000-0000-4000-8000-000000000001',
  'open','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Finance site access required', 'Area Manager cannot review an ungranted site');
insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  '2026-09-01','unmatched-cost-v1','site','40000000-0000-4000-8000-000000000002',
  'open','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003');
select is((select count(*) from public.finance_exception_reviews),1::bigint,
  'Area Manager reads only the one granted-site review');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'Supervisor cannot read finance reviews');
select throws_ok($$insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-10-01','unmatched-cost-v1','site','40000000-0000-4000-8000-000000000001',
  'open','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Finance site access required', 'Supervisor cannot create finance reviews');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'other tenant Director cannot read finance reviews');
select throws_ok($$insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-10-01','unmatched-cost-v1','site','40000000-0000-4000-8000-000000000001',
  'open','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006')$$,
  'P0001','Finance site access required','other tenant Director cannot write finance reviews');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'Operations Manager with a site grant cannot read finance reviews');
select throws_ok($$insert into public.finance_exception_reviews
  (organization_id,site_id,period_start,rule_id,source_type,source_id,state,owner_user_id,updated_by)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '2026-10-01','unmatched-cost-v1','site','40000000-0000-4000-8000-000000000001',
  'open','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000007')$$,
  'P0001','Finance site access required','Operations Manager cannot write finance reviews');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'cleaner cannot read finance reviews');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'client viewer cannot read finance reviews');

reset role;
update public.member_site_access set ends_at=now()-interval '1 day'
where id='41000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.finance_exception_reviews),0::bigint,
  'revoked Area Manager site grant hides prior review state');

select * from finish();
rollback;
