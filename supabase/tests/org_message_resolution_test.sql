begin;
set local search_path = public, extensions;
select plan(8);

select ok((select relrowsecurity from pg_class
  where oid = 'public.external_message_site_resolutions'::regclass),
  'site-resolution audit has RLS');
select ok(not has_table_privilege('authenticated',
  'public.external_message_site_resolutions', 'select'),
  'authenticated callers cannot read the raw audit table');
select ok(not has_function_privilege('anon',
  'public.list_org_unassigned_messages(uuid,integer)', 'execute'),
  'anonymous caller cannot list organization intake');

set local role service_role;
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'd1630000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'pgtap-org-intake', '{}'::jsonb, repeat('a', 64)
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content
) values (
  'e1630000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'd1630000-0000-4000-8000-000000000011',
  'pgtap-org-intake-message', 'pgtap-org-thread', 'unknown-sender',
  now(), now(), 'Synthetic unassigned source'
);
update public.external_message_contexts
  set id = 'f1630000-0000-4000-8000-000000000011', site_id = null,
      zone_id = null, task_run_id = null, resolution_status = 'unresolved'
  where external_message_id = 'e1630000-0000-4000-8000-000000000011';

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.list_org_unassigned_messages(
  '10000000-0000-4000-8000-000000000001') $$,
  '42501', 'org_message_review_denied',
  'site supervisor cannot list site-less messages');
select throws_ok($$ select public.resolve_org_unassigned_message(
  '10000000-0000-4000-8000-000000000001',
  'f1630000-0000-4000-8000-000000000011', 'assign',
  '40000000-0000-4000-8000-000000000001', 'Unsafe role') $$,
  '42501', 'org_message_review_denied',
  'site supervisor cannot assign site');

select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_org_unassigned_messages(
  '10000000-0000-4000-8000-000000000001')
  where context_id = 'f1630000-0000-4000-8000-000000000011'),
  1::bigint, 'Director can see the unassigned source');
select throws_ok($$ select public.resolve_org_unassigned_message(
  '10000000-0000-4000-8000-000000000001',
  'f1630000-0000-4000-8000-000000000011', 'assign',
  '40000000-0000-4000-8000-000000000003', 'Wrong tenant') $$,
  '42501', 'site_not_in_organization',
  'Director cannot assign another tenant site');
select lives_ok($$ select public.resolve_org_unassigned_message(
  '10000000-0000-4000-8000-000000000001',
  'f1630000-0000-4000-8000-000000000011', 'assign',
  '40000000-0000-4000-8000-000000000001', 'Verified receiving casino') $$,
  'Director assigns same-org site for later context review');
rollback;
