begin;
set local role service_role;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values
  ('c9400000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'whatsapp_cloud_api', 'phone-c014', 'Canonical phone'),
  ('c9400000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'event_adapter', 'phone-c014', 'Bound adapter'),
  ('c9400000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', 'whatsapp_cloud_api', 'phone-other-c014', 'Other tenant');
insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source
) values (
  'adapter_key_c014', '10000000-0000-4000-8000-000000000001',
  'c9400000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001', 'whatsapp'
);
insert into public.integration_adapter_canonical_bindings (
  organization_id, adapter_account_id, source, canonical_account_id, verification_reference
) values (
  '10000000-0000-4000-8000-000000000001',
  'c9400000-0000-4000-8000-000000000002', 'whatsapp',
  'c9400000-0000-4000-8000-000000000001', 'synthetic-provider-account-proof'
);

do $$
declare
  v_message jsonb;
  v_official record;
  v_adapter record;
  v_id uuid;
  v_conflict_message jsonb;
  v_recovered record;
begin
  -- Official -> adapter: independent authenticated deliveries, one domain row.
  v_message := '{"externalMessageId":"wamid.c014-first","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-28T17:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}'::jsonb;
  select * into v_official from public.accept_whatsapp_ingress_event(
    'phone-c014', 'meta_webhook:c014-first',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('a',64), 'meta_webhook'
  );
  select * into v_adapter from public.accept_adapter_ingress_event(
    'adapter_key_c014', 'whatsapp', 'phone-c014', 'adapter-c014-first',
    'nonce_c014_first_12345',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('b',64),
    '{"forwardedBy":"synthetic-relay","synthetic":true}'::jsonb
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='c014', lease_expires_at=now()+interval '1 minute'
   where id in (v_official.job_id, v_adapter.job_id);
  perform * from public.complete_processing_job(v_official.job_id,'c014',jsonb_build_array(v_message));
  perform * from public.complete_processing_job(v_adapter.job_id,'c014',jsonb_build_array(v_message));
  select id into v_id from public.external_messages
   where integration_account_id='c9400000-0000-4000-8000-000000000001'
     and external_message_id='wamid.c014-first';
  if v_id is null
     or (select count(*) from public.external_messages where external_message_id='wamid.c014-first') <> 1
     or (select count(*) from public.integration_message_deliveries where normalized_message_id=v_id) <> 2
     or (select count(distinct transport) from public.integration_message_deliveries where normalized_message_id=v_id) <> 2
     or (select count(*) from public.finance_intake_items where source_message_id=v_id) <> 1 then
    raise exception 'official-first dedupe or provenance failed';
  end if;

  -- Adapter -> official: canonical identity survives reversed arrival order.
  v_message := jsonb_set(v_message, '{externalMessageId}', '"wamid.c014-reversed"'::jsonb);
  select * into v_adapter from public.accept_adapter_ingress_event(
    'adapter_key_c014', 'whatsapp', 'phone-c014', 'adapter-c014-reversed',
    'nonce_c014_second_1234',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('c',64), '{"synthetic":true}'::jsonb
  );
  select * into v_official from public.accept_whatsapp_ingress_event(
    'phone-c014', 'make_relay:c014-reversed',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('d',64), 'make_relay'
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='c014', lease_expires_at=now()+interval '1 minute'
   where id in (v_official.job_id, v_adapter.job_id);
  perform * from public.complete_processing_job(v_adapter.job_id,'c014',jsonb_build_array(v_message));
  perform * from public.complete_processing_job(v_official.job_id,'c014',jsonb_build_array(v_message));
  if (select count(*) from public.external_messages where external_message_id='wamid.c014-reversed') <> 1
     or (select count(*) from public.integration_message_deliveries
          where provider_message_id='wamid.c014-reversed') <> 2 then
    raise exception 'adapter-first dedupe failed';
  end if;

  -- A conflicting second body fails permanently, leaving the original row.
  v_message := jsonb_set(v_message, '{externalMessageId}', '"wamid.c014-conflict"'::jsonb);
  select * into v_official from public.accept_whatsapp_ingress_event(
    'phone-c014', 'meta_webhook:c014-conflict',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('e',64), 'meta_webhook'
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='c014', lease_expires_at=now()+interval '1 minute'
   where id=v_official.job_id;
  perform * from public.complete_processing_job(v_official.job_id,'c014',jsonb_build_array(v_message));
  v_conflict_message := jsonb_set(v_message, '{text}', '"Different receipt"'::jsonb);
  select * into v_adapter from public.accept_adapter_ingress_event(
    'adapter_key_c014', 'whatsapp', 'phone-c014', 'adapter-c014-conflict',
    'nonce_c014_third_12345',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_conflict_message)), repeat('f',64), '{"synthetic":true}'::jsonb
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='c014', lease_expires_at=now()+interval '1 minute'
   where id=v_adapter.job_id;
  begin
    perform * from public.complete_processing_job(v_adapter.job_id,'c014',jsonb_build_array(v_conflict_message));
    raise exception 'conflicting logical identity was accepted';
  exception when unique_violation then
    if sqlerrm <> 'logical_message_conflict' then raise; end if;
  end;
  if public.fail_processing_job(v_adapter.job_id,'c014','logical_message_conflict',30) <> 'failed'
     or (select text_content from public.external_messages
           where external_message_id='wamid.c014-conflict') <> 'Fuel receipt'
     or (select count(*) from public.integration_message_deliveries
           where provider_message_id='wamid.c014-conflict') <> 1 then
    raise exception 'conflicting delivery overwrote first source or was not reviewable';
  end if;

  -- The adapter worker can reclaim a crashed lease without a duplicate row.
  v_message := jsonb_set(v_message, '{externalMessageId}', '"wamid.c014-crash"'::jsonb);
  select * into v_adapter from public.accept_adapter_ingress_event(
    'adapter_key_c014', 'whatsapp', 'phone-c014', 'adapter-c014-crash',
    'nonce_c014_crash_12345',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-c014',
      'messages',jsonb_build_array(v_message)), repeat('2',64), '{"synthetic":true}'::jsonb
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='crashed-worker', lease_expires_at=now()-interval '1 second'
   where id=v_adapter.job_id;
  select * into v_recovered from public.claim_adapter_processing_job('replacement-worker',60);
  if v_recovered.job_id is distinct from v_adapter.job_id or v_recovered.attempt_count <> 2 then
    raise exception 'expired adapter lease was not reclaimed';
  end if;
  perform * from public.complete_processing_job(v_recovered.job_id,'replacement-worker',jsonb_build_array(v_message));
  if (select count(*) from public.external_messages where external_message_id='wamid.c014-crash') <> 1 then
    raise exception 'crash recovery duplicated normalized message';
  end if;

  -- A different account/organization can use the same provider message ID.
  v_message := jsonb_set(v_message, '{externalMessageId}', '"wamid.c014-conflict"'::jsonb);
  select * into v_official from public.accept_whatsapp_ingress_event(
    'phone-other-c014', 'meta_webhook:c014-other',
    jsonb_build_object('schemaVersion',1,'providerEventId',null,'accountExternalId','phone-other-c014',
      'messages',jsonb_build_array(v_message)), repeat('1',64), 'meta_webhook'
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='c014', lease_expires_at=now()+interval '1 minute'
   where id=v_official.job_id;
  perform * from public.complete_processing_job(v_official.job_id,'c014',jsonb_build_array(v_message));
  if (select count(*) from public.external_messages where external_message_id='wamid.c014-conflict') <> 2 then
    raise exception 'distinct organization message was collapsed';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.integration_adapter_canonical_bindings (
      organization_id, adapter_account_id, source, canonical_account_id, verification_reference
    ) values (
      '10000000-0000-4000-8000-000000000001',
      'c9400000-0000-4000-8000-000000000002', 'whatsapp',
      'c9400000-0000-4000-8000-000000000003', 'invalid-cross-tenant'
    );
    raise exception 'cross-tenant canonical binding was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'adapter_binding_scope_denied' then raise; end if;
  end;
end;
$$;

reset role;
set local role authenticated;
do $$
begin
  begin
    perform * from public.integration_adapter_canonical_bindings;
    raise exception 'browser role read adapter binding';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.integration_message_deliveries;
    raise exception 'browser role read delivery ledger';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
