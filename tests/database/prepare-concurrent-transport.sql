set role service_role;
insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values
  ('c9500000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'whatsapp_cloud_api', 'phone-concurrent-c014', 'Concurrent canonical'),
  ('c9500000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'event_adapter', 'phone-concurrent-c014', 'Concurrent adapter');
insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source
) values ('adapter_key_concurrent_c014', '10000000-0000-4000-8000-000000000001',
  'c9500000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'whatsapp');
insert into public.integration_adapter_canonical_bindings (
  organization_id, adapter_account_id, source, canonical_account_id, verification_reference
) values ('10000000-0000-4000-8000-000000000001',
  'c9500000-0000-4000-8000-000000000002', 'whatsapp',
  'c9500000-0000-4000-8000-000000000001', 'synthetic-concurrent-proof');
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256, transport
) values
  ('c9500000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001', 'meta_webhook:concurrent-c014',
   '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"phone-concurrent-c014","messages":[{"externalMessageId":"wamid.concurrent-c014","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-28T17:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
   repeat('a',64), 'meta_webhook'),
  ('c9500000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000002', 'adapter:concurrent-c014',
   '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"phone-concurrent-c014","messages":[{"externalMessageId":"wamid.concurrent-c014","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-28T17:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
   repeat('b',64), 'legacy');
insert into public.integration_adapter_event_provenance (
  integration_event_id, organization_id, source, source_event_id, synthetic
) values ('c9500000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000001', 'whatsapp', 'adapter-concurrent-c014', true);
insert into public.processing_jobs (
  id, organization_id, integration_event_id, kind, dedupe_key, status,
  attempt_count, lease_owner, lease_expires_at
) values
  ('c9500000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000011', 'normalize_external_messages',
   'meta_webhook:concurrent-c014', 'processing', 1, 'c014-concurrent', now()+interval '2 minutes'),
  ('c9500000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000012', 'normalize_external_messages',
   'adapter:concurrent-c014', 'processing', 1, 'c014-concurrent', now()+interval '2 minutes');
