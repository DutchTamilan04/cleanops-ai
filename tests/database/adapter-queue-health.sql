begin;
set local role service_role;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values (
  'c1650000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'event_adapter', 'queue-health-test', 'Queue health test'
);
insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source
) values (
  'queue_health_key', '10000000-0000-4000-8000-000000000001',
  'c1650000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', 'whatsapp'
);
insert into public.integration_adapter_nonces (key_id, nonce, created_at) values
  ('queue_health_key', 'old_nonce_1234567890', now() - interval '2 days'),
  ('queue_health_key', 'new_nonce_1234567890', now());
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values
  ('d1650000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   'c1650000-0000-4000-8000-000000000001', 'queue-pending', '{}'::jsonb, repeat('a',64)),
  ('d1650000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   'c1650000-0000-4000-8000-000000000001', 'queue-failed', '{}'::jsonb, repeat('b',64));
insert into public.processing_jobs (
  organization_id, integration_event_id, kind, dedupe_key, status,
  attempt_count, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001',
   'd1650000-0000-4000-8000-000000000001',
   'normalize_external_messages', 'queue-pending', 'pending', 1,
   now() - interval '10 minutes', now() - interval '10 minutes'),
  ('10000000-0000-4000-8000-000000000001',
   'd1650000-0000-4000-8000-000000000002',
   'normalize_external_messages', 'queue-failed', 'failed', 5,
   now() - interval '20 minutes', now() - interval '5 minutes');

do $$ declare v_health record; begin
  select * into v_health from public.get_adapter_queue_health_v2();
  if v_health.pending_count < 1 or v_health.retrying_count < 1
     or v_health.failed_count < 1
     or v_health.oldest_pending_at > now() - interval '9 minutes'
     or v_health.oldest_failed_at is null then
    raise exception 'adapter queue signals omit pending/retry/dead-letter state';
  end if;
  if public.prune_adapter_nonces() < 1 then
    raise exception 'old adapter nonce was not pruned';
  end if;
  if exists(select 1 from public.integration_adapter_nonces
    where key_id = 'queue_health_key' and nonce = 'old_nonce_1234567890')
    or not exists(select 1 from public.integration_adapter_nonces
    where key_id = 'queue_health_key' and nonce = 'new_nonce_1234567890') then
    raise exception 'adapter nonce pruning did not respect the one-day boundary';
  end if;
end $$;

reset role;
set local role authenticated;
do $$ begin
  begin
    perform * from public.get_adapter_queue_health_v2();
    raise exception 'browser role read adapter queue health';
  exception when insufficient_privilege then null; end;
  begin
    perform public.prune_adapter_nonces();
    raise exception 'browser role pruned adapter nonces';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
