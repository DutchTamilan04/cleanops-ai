begin;
set local role service_role;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values
  ('c9600000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'event_adapter', 'adapter-media-a', 'Media A'),
  ('c9600000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', 'event_adapter', 'adapter-media-b', 'Media B'),
  ('c9600000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002', 'event_adapter', 'adapter-media-east', 'Media East');
insert into public.integration_adapter_credentials (
  key_id, organization_id, integration_account_id, site_id, source
) values
  ('adapter_media_key_a', '10000000-0000-4000-8000-000000000001',
   'c9600000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001','whatsapp'),
  ('adapter_media_key_b', '10000000-0000-4000-8000-000000000002',
   'c9600000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003','whatsapp'),
  ('adapter_media_key_east', '10000000-0000-4000-8000-000000000001',
   'c9600000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002','whatsapp');

do $$
declare
  v_payload jsonb;
  v_accepted record;
  v_upload record;
  v_retry record;
  v_first_path text;
  v_evidence uuid;
  v_expired integer;
begin
  v_payload := jsonb_build_object(
    'schemaVersion',1,'providerEventId',null,'accountExternalId','adapter-media-a',
    'messages',jsonb_build_array(jsonb_build_object(
      'externalMessageId','media-message-1','externalThreadId','sender-1',
      'senderId','sender-1','occurredAt','2026-09-28T18:00:00Z',
      'text','Photo from cleaning round','schemaVersion',1,
      'mediaRefs',jsonb_build_array(jsonb_build_object(
        'externalId','photo-1','contentType','image/png')))),
    'adapterMedia',jsonb_build_array(jsonb_build_object(
      'externalId','photo-1','kind','image','mimeType','image/png',
      'byteSize',68,'sha256',repeat('a',64)))
  );
  select * into v_accepted from public.accept_adapter_ingress_event(
    'adapter_media_key_a','whatsapp','adapter-media-a','media-event-1',
    'nonce_media_accept_1234',v_payload,repeat('b',64),'{"synthetic":true}'::jsonb
  );
  update public.processing_jobs set status='processing', attempt_count=1,
    lease_owner='media-worker',lease_expires_at=now()+interval '1 minute'
   where id=v_accepted.job_id;
  perform * from public.complete_processing_job(
    v_accepted.job_id,'media-worker',v_payload -> 'messages'
  );
  select evidence_id into v_evidence from public.integration_adapter_media_uploads
   where job_id=v_accepted.job_id and media_external_id='photo-1';
  if v_evidence is null
     or (select count(*) from public.task_evidence where id=v_evidence
           and organization_id='10000000-0000-4000-8000-000000000001'
           and site_id='40000000-0000-4000-8000-000000000001'
           and sha256=repeat('a',64) and content_type='image/png'
           and byte_size=68 and processing_status='staged') <> 1
     or (select text_content from public.external_messages
           where external_message_id='media-message-1') <> 'Photo from cleaning round' then
    raise exception 'media staging lost text or accepted wrong scope/metadata';
  end if;
  if exists(select 1 from public.get_adapter_media_upload(
      'adapter_media_key_b','nonce_media_wrong_1234',v_accepted.job_id,'photo-1')) then
    raise exception 'other tenant read private upload';
  end if;
  if exists(select 1 from public.get_adapter_media_upload(
      'adapter_media_key_east','nonce_media_east_1234',v_accepted.job_id,'photo-1')) then
    raise exception 'other site read private upload';
  end if;
  select * into v_upload from public.prepare_adapter_media_upload(
    'adapter_media_key_a','nonce_media_prepare_1234',v_accepted.job_id,'photo-1',false
  );
  if v_upload.evidence_id <> v_evidence or v_upload.ticket_expires_at <= now()
     or v_upload.processing_status <> 'staged' then
    raise exception 'scoped upload ticket was not prepared';
  end if;
  v_first_path := v_upload.storage_path;
  begin
    perform * from public.prepare_adapter_media_upload(
      'adapter_media_key_a','nonce_media_prepare_1234',v_accepted.job_id,'photo-1',false
    );
    raise exception 'replayed media ticket nonce was accepted';
  exception when unique_violation then
    if sqlerrm <> 'adapter_replay_detected' then raise; end if;
  end;
  -- The scheduled expiry records a recoverable missing reason; a signed retry
  -- rotates the private path so an old two-hour upload token cannot overwrite it.
  update public.integration_adapter_media_uploads
     set ticket_expires_at=now()-interval '1 second'
   where evidence_id=v_evidence;
  v_expired := public.expire_adapter_media_uploads();
  if v_expired <> 1
     or (select processing_status from public.task_evidence where id=v_evidence) <> 'missing'
     or (select resolution_code from public.task_evidence where id=v_evidence) <> 'adapter_media_timeout' then
    raise exception 'expired media did not enter recoverable missing state';
  end if;
  select * into v_retry from public.prepare_adapter_media_upload(
    'adapter_media_key_a','nonce_media_retry_12345',v_accepted.job_id,'photo-1',true
  );
  if v_retry.evidence_id <> v_evidence or v_retry.storage_path=v_first_path
     or v_retry.processing_status <> 'staged' then
    raise exception 'media retry did not rotate private storage path';
  end if;
  perform public.mark_evidence_ingestion_problem(v_evidence,'quarantined','adapter_media_integrity_mismatch');
  if (select processing_status from public.task_evidence where id=v_evidence) <> 'quarantined'
     or (select count(*) from public.integration_adapter_media_uploads
          where job_id=v_accepted.job_id and media_external_id='photo-1') <> 1 then
    raise exception 'unsafe media did not retain one reviewable terminal row';
  end if;
end;
$$;

reset role;
set local role authenticated;
do $$
begin
  begin
    perform * from public.integration_adapter_media_uploads;
    raise exception 'browser role read adapter media upload ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.prepare_adapter_media_upload(
      'adapter_media_key_a','nonce_media_browser_1234',
      'c9600000-0000-4000-8000-000000000001','photo-1',false
    );
    raise exception 'browser role created adapter upload ticket';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
