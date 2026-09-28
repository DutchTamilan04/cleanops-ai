begin;
set local role service_role;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values
  ('c9300000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'event_adapter', 'adapter-site-a', 'Adapter A'),
  ('c9300000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', 'event_adapter', 'adapter-site-b', 'Adapter B'),
  ('c9300000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'whatsapp_cloud_api', 'phone-shadow', 'WhatsApp shadow');

insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source,
  capabilities
) values
  ('adapter_key_a', '10000000-0000-4000-8000-000000000001',
   'c9300000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'whatsapp',
   array['message:write', 'status:read']),
  ('adapter_key_b', '10000000-0000-4000-8000-000000000002',
   'c9300000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', 'whatsapp',
   array['message:write', 'status:read']);

do $$
declare
  v_payload jsonb := '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"adapter-site-a","messages":[{"externalMessageId":"provider-message-1","externalThreadId":"thread-1","senderId":"worker-1","occurredAt":"2026-09-28T09:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]}';
  v_first record;
  v_duplicate record;
  v_claim record;
  v_completed record;
  v_status record;
  v_whatsapp record;
begin
  select * into v_whatsapp from public.accept_whatsapp_ingress_event(
    'phone-shadow', 'sha256:shadow',
    '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"phone-shadow","messages":[{"externalMessageId":"shadow-message","externalThreadId":"shadow-thread","senderId":"shadow-worker","occurredAt":"2026-09-28T09:00:00Z","text":"Non-adapter event","mediaRefs":[],"schemaVersion":1}]}',
    repeat('c', 64)
  );
  select * into v_first from public.accept_adapter_ingress_event(
    'adapter_key_a', 'whatsapp', 'adapter-site-a', 'event-1',
    'nonce_1234567890123456', v_payload, repeat('a', 64), '{"synthetic":true}'
  );
  if v_first.duplicate or v_first.job_id is null then
    raise exception 'first adapter envelope was not accepted';
  end if;
  if (select organization_id from public.integration_webhook_events where id = v_first.event_id)
     <> '10000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'adapter tenant was not derived from registered account';
  end if;

  begin
    perform * from public.accept_adapter_ingress_event(
      'adapter_key_a', 'whatsapp', 'adapter-site-a', 'event-1',
      'nonce_1234567890123456', v_payload, repeat('a', 64), '{"synthetic":true}'
    );
    raise exception 'nonce replay was accepted';
  exception when unique_violation then
    if sqlerrm <> 'adapter_replay_detected' then raise; end if;
  end;

  select * into v_duplicate from public.accept_adapter_ingress_event(
    'adapter_key_a', 'whatsapp', 'adapter-site-a', 'new-transport-event',
    'nonce_2345678901234567', v_payload, repeat('a', 64), '{"synthetic":true}'
  );
  if not v_duplicate.duplicate or v_duplicate.event_id <> v_first.event_id
     or v_duplicate.job_id <> v_first.job_id then
    raise exception 'adapter message idempotency failed';
  end if;

  begin
    perform * from public.accept_adapter_ingress_event(
      'adapter_key_a', 'whatsapp', 'adapter-site-a', 'event-2',
      'nonce_3456789012345678', v_payload, repeat('b', 64), '{"synthetic":true}'
    );
    raise exception 'changed payload reused message identity';
  exception when unique_violation then
    if sqlerrm <> 'adapter_message_identity_conflict' then raise; end if;
  end;

  begin
    perform * from public.accept_adapter_ingress_event(
      'adapter_key_a', 'whatsapp', 'adapter-site-b', 'event-3',
      'nonce_4567890123456789', v_payload, repeat('a', 64), '{"synthetic":true}'
    );
    raise exception 'cross-tenant account was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'adapter_account_not_authorized' then raise; end if;
  end;

  select * into v_status from public.get_adapter_ingress_status('adapter_key_a', v_first.job_id);
  if v_status.status <> 'pending' or v_status.attempt_count <> 0 then
    raise exception 'scoped adapter status was not available';
  end if;
  if exists(select 1 from public.get_adapter_ingress_status('adapter_key_b', v_first.job_id)) then
    raise exception 'other tenant could read adapter status';
  end if;

  select * into v_claim from public.claim_adapter_processing_job('adapter-test-worker', 60);
  if v_claim.job_id <> v_first.job_id then
    raise exception 'adapter worker claimed the wrong provider job';
  end if;
  if (select status from public.processing_jobs where id = v_whatsapp.job_id) <> 'pending' then
    raise exception 'adapter worker changed WhatsApp job state';
  end if;
  select * into v_completed from public.complete_processing_job(
    v_claim.job_id, 'adapter-test-worker', v_payload -> 'messages'
  );
  if v_completed.inserted_count <> 1
     or (select count(*) from public.finance_intake_items
         where source_message_id = (
           select id from public.external_messages
           where integration_event_id = v_first.event_id
         )) <> 1 then
    raise exception 'adapter did not reuse normalized finance candidate path';
  end if;
  if (select intent_kind from public.external_message_contexts
      where external_message_id = (
        select id from public.external_messages where integration_event_id = v_first.event_id
      )) <> 'finance_candidate' then
    raise exception 'adapter message did not receive review-only intent';
  end if;
  if (select status from public.get_adapter_ingress_status('adapter_key_a', v_first.job_id)) <> 'succeeded' then
    raise exception 'adapter status did not reflect completion';
  end if;
end;
$$;

reset role;
set local role authenticated;
do $$
begin
  begin
    perform * from public.integration_adapter_credentials;
    raise exception 'browser role read adapter credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.accept_adapter_ingress_event(
      'adapter_key_a','whatsapp','adapter-site-a','event-4',
      'nonce_5678901234567890','{}'::jsonb,repeat('a',64),'{}'::jsonb
    );
    raise exception 'browser role executed adapter intake';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
