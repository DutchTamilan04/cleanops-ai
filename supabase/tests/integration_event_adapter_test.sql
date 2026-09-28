begin;
set local search_path = public, extensions;
select plan(11);

select ok((select relrowsecurity from pg_class where oid='public.integration_adapter_credentials'::regclass),
  'adapter credentials have RLS');
select ok((select relrowsecurity from pg_class where oid='public.integration_adapter_nonces'::regclass),
  'adapter nonces have RLS');
select ok(not has_table_privilege('authenticated', 'public.integration_adapter_credentials', 'select'),
  'browser roles cannot read credentials');
select ok(not has_function_privilege('anon',
  'public.accept_adapter_ingress_event(text,text,text,text,text,jsonb,text,jsonb)', 'execute'),
  'anonymous callers cannot accept events');
select ok(not has_function_privilege('authenticated',
  'public.accept_adapter_ingress_event(text,text,text,text,text,jsonb,text,jsonb)', 'execute'),
  'authenticated callers cannot accept events');

set local role service_role;
insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values (
  'c9310000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'event_adapter', 'pgtap-adapter-account', 'pgTAP adapter'
);
insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source, capabilities
) values (
  'pgtap_adapter_key', '10000000-0000-4000-8000-000000000001',
  'c9310000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'whatsapp', array['message:write', 'status:read']
);

create temporary table adapter_first as
select * from public.accept_adapter_ingress_event(
  'pgtap_adapter_key', 'whatsapp', 'pgtap-adapter-account', 'pgtap-event-1',
  'pgtap_nonce_1234567890',
  '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"pgtap-adapter-account","messages":[{"externalMessageId":"pgtap-adapter-message","externalThreadId":"pgtap-thread","senderId":"pgtap-sender","occurredAt":"2026-09-28T09:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]}',
  repeat('a',64), '{"synthetic":true}'
);
create temporary table adapter_duplicate as
select * from public.accept_adapter_ingress_event(
  'pgtap_adapter_key', 'whatsapp', 'pgtap-adapter-account', 'pgtap-event-2',
  'pgtap_nonce_2345678901',
  '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"pgtap-adapter-account","messages":[{"externalMessageId":"pgtap-adapter-message","externalThreadId":"pgtap-thread","senderId":"pgtap-sender","occurredAt":"2026-09-28T09:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]}',
  repeat('a',64), '{"synthetic":true}'
);

select is((select duplicate from adapter_first), false, 'first adapter event is new');
select is((select duplicate from adapter_duplicate), true, 'retry is idempotent');
select is((select job_id from adapter_first), (select job_id from adapter_duplicate),
  'retry keeps one job');
select is((select count(*) from public.get_adapter_ingress_status(
  'pgtap_adapter_key', (select job_id from adapter_first))), 1::bigint,
  'credential can read its job status');
select is((select count(*) from public.get_adapter_ingress_status(
  'wrong_adapter_key', (select job_id from adapter_first))), 0::bigint,
  'unknown credential cannot read job status');
select is((select count(*) from public.integration_adapter_event_provenance
  where integration_event_id=(select event_id from adapter_first) and synthetic), 1::bigint,
  'synthetic provenance is retained');

rollback;
