begin;
set local search_path = public, extensions;
select plan(8);

select ok(not has_table_privilege('authenticated',
  'public.integration_adapter_event_provenance', 'select'),
  'reviewers cannot read raw adapter provenance directly');

set local role service_role;
insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values (
  'c9810000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'event_adapter', 'pgtap-email-source', 'Synthetic email pgTAP'
);
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'd9810000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c9810000-0000-4000-8000-000000000001',
  'pgtap-handoff', '{}'::jsonb, repeat('a', 64)
);
insert into public.integration_adapter_event_provenance (
  integration_event_id, organization_id, source, source_event_id,
  forwarded_by, synthetic
) values (
  'd9810000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'email', 'pgtap-handoff', 'synthetic-relay', true
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
) values
  ('e9810000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   'c9810000-0000-4000-8000-000000000001',
   'd9810000-0000-4000-8000-000000000001',
   'pgtap-receipt', 'pgtap-thread', 'original-sender', now(), now(),
   'Fuel receipt for test job', '[]'::jsonb),
  ('e9810000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   'c9810000-0000-4000-8000-000000000001',
   'd9810000-0000-4000-8000-000000000001',
   'pgtap-supply', 'pgtap-thread', 'original-sender', now(), now(),
   'Need supplies for site', '[]'::jsonb);

select is((select intent_kind from public.external_message_contexts
  where external_message_id = 'e9810000-0000-4000-8000-000000000001'),
  'finance_candidate', 'receipt remains a finance review hint');
select is((select intent_kind from public.external_message_contexts
  where external_message_id = 'e9810000-0000-4000-8000-000000000002'),
  'supply_request', 'supply request remains an operational review hint');
select is((select count(*) from public.finance_intake_items
  where source_message_id in (
    'e9810000-0000-4000-8000-000000000001',
    'e9810000-0000-4000-8000-000000000002')), 1::bigint,
  'only the receipt creates a finance draft');
select is((select source_kind from public.finance_intake_items
  where source_message_id = 'e9810000-0000-4000-8000-000000000001'),
  'adapter', 'non-WhatsApp receipt retains integration source');
select is((select count(*) from public.expense_claims claim
  join public.finance_intake_items intake on intake.id = claim.intake_id
  where intake.source_message_id = 'e9810000-0000-4000-8000-000000000001'),
  0::bigint, 'classifier does not approve an expense');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select is((select forwarded_by from public.list_site_external_messages(
  '40000000-0000-4000-8000-000000000001', 25)
  where message_id = 'e9810000-0000-4000-8000-000000000001'),
  'synthetic-relay', 'site reviewer sees forwarder separately from original sender');
select ok((select synthetic from public.list_site_external_messages(
  '40000000-0000-4000-8000-000000000001', 25)
  where message_id = 'e9810000-0000-4000-8000-000000000001'),
  'site reviewer sees synthetic source marker');
rollback;
