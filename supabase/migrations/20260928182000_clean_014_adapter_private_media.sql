-- CLEAN-014A: signed adapter media is staged only after its text/event job
-- normalizes. Supabase's private operational-evidence bucket owns the bytes.
create table public.integration_adapter_media_uploads (
  organization_id uuid not null,
  job_id uuid not null,
  media_external_id text not null check (char_length(media_external_id) between 1 and 255),
  evidence_id uuid not null unique,
  ticket_expires_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, media_external_id),
  foreign key (organization_id, job_id)
    references public.processing_jobs (organization_id, id) on delete cascade,
  foreign key (organization_id, evidence_id)
    references public.task_evidence (organization_id, id) on delete cascade
);
create index integration_adapter_media_uploads_expiry_idx
  on public.integration_adapter_media_uploads (ticket_expires_at, created_at);
alter table public.integration_adapter_media_uploads enable row level security;
revoke all on public.integration_adapter_media_uploads from anon, authenticated;
grant all on public.integration_adapter_media_uploads to service_role;

create function public.stage_adapter_message_media()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.integration_webhook_events%rowtype;
  v_message public.external_messages%rowtype;
  v_media jsonb;
  v_evidence public.task_evidence%rowtype;
  v_evidence_id uuid;
  v_extension text;
begin
  select event.* into v_event from public.integration_webhook_events event
    join public.integration_accounts account
      on account.organization_id = event.organization_id
     and account.id = event.integration_account_id
   where event.organization_id = new.organization_id
     and event.id = new.integration_event_id
     and account.provider = 'event_adapter';
  if not found or coalesce(jsonb_array_length(v_event.payload -> 'adapterMedia'),0) = 0 then
    return new;
  end if;
  select message.* into v_message from public.integration_message_deliveries delivery
    join public.external_messages message
      on message.organization_id = delivery.organization_id
     and message.id = delivery.normalized_message_id
   where delivery.organization_id = new.organization_id
     and delivery.integration_event_id = v_event.id
     and delivery.provider_message_id = v_event.payload #>> '{messages,0,externalMessageId}';
  if not found then
    raise exception using errcode = 'P0001', message = 'adapter_media_message_not_found';
  end if;
  for v_media in select value from jsonb_array_elements(v_event.payload -> 'adapterMedia') loop
    if v_media ->> 'kind' <> 'image'
       or v_media ->> 'mimeType' not in ('image/jpeg','image/png','image/webp')
       or (v_media ->> 'byteSize')::bigint not between 1 and 10485760
       or v_media ->> 'sha256' !~ '^[0-9a-f]{64}$'
       or char_length(coalesce(v_media ->> 'externalId','')) not between 1 and 255
       or not v_message.media_refs @> jsonb_build_array(
         jsonb_build_object('externalId',v_media ->> 'externalId',
                            'contentType',v_media ->> 'mimeType')) then
      raise exception using errcode = '22023', message = 'invalid_adapter_media_metadata';
    end if;
    v_evidence_id := gen_random_uuid();
    v_extension := case v_media ->> 'mimeType'
      when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
    insert into public.task_evidence (
      id, organization_id, integration_account_id, external_message_id,
      media_external_id, site_id, storage_path, content_type, byte_size,
      sha256, captured_at, received_at
    ) values (
      v_evidence_id, new.organization_id, v_message.integration_account_id,
      v_message.id, v_media ->> 'externalId',
      (select site_id from public.integration_accounts
        where organization_id = new.organization_id and id = v_message.integration_account_id),
      new.organization_id::text || '/' || v_evidence_id::text || '/source.' || v_extension,
      v_media ->> 'mimeType', (v_media ->> 'byteSize')::bigint,
      v_media ->> 'sha256', v_message.occurred_at, v_message.received_at
    ) on conflict (integration_account_id, external_message_id, media_external_id) do nothing
    returning * into v_evidence;
    if v_evidence.id is null then
      select * into strict v_evidence from public.task_evidence
       where integration_account_id = v_message.integration_account_id
         and external_message_id = v_message.id
         and media_external_id = v_media ->> 'externalId';
      if v_evidence.sha256 is distinct from v_media ->> 'sha256'
         or v_evidence.content_type is distinct from v_media ->> 'mimeType'
         or v_evidence.byte_size is distinct from (v_media ->> 'byteSize')::bigint then
        raise exception using errcode = '23505', message = 'logical_message_conflict';
      end if;
    else
      insert into public.evidence_audit_events (
        organization_id, site_id, evidence_id, action, details
      ) values (new.organization_id, v_evidence.site_id, v_evidence.id,
        'evidence.staged', jsonb_build_object('media_external_id',v_media ->> 'externalId'));
    end if;
    insert into public.integration_adapter_media_uploads (
      organization_id, job_id, media_external_id, evidence_id
    ) values (new.organization_id,new.id,v_media ->> 'externalId',v_evidence.id)
    on conflict (job_id,media_external_id) do nothing;
  end loop;
  return new;
end;
$$;
create trigger zz_processing_jobs_stage_adapter_media
after update of status on public.processing_jobs
for each row when (new.status = 'succeeded' and old.status is distinct from new.status)
execute function public.stage_adapter_message_media();
revoke execute on function public.stage_adapter_message_media() from public, anon, authenticated;
grant execute on function public.stage_adapter_message_media() to service_role;

-- Both media commands consume a signed nonce and return only the matching
-- credential's job/evidence. A cross-site or cross-tenant key gets no row.
create function public.get_adapter_media_upload(
  p_key_id text, p_nonce text, p_job_id uuid, p_media_external_id text
)
returns table (
  evidence_id uuid, storage_path text,
  processing_status public.evidence_processing_status,
  resolution_code text, content_type text, byte_size bigint, sha256 text,
  ticket_expires_at timestamptz
)
language plpgsql security invoker set search_path = '' as $$
declare v_credential public.integration_adapter_credentials%rowtype;
begin
  if p_nonce !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_adapter_nonce';
  end if;
  select credential.* into v_credential
    from public.integration_adapter_credentials credential
   where credential.key_id = p_key_id and credential.enabled
     and credential.valid_from <= now()
     and (credential.expires_at is null or credential.expires_at > now())
     and 'message:write' = any(credential.capabilities);
  if not found then return; end if;
  return query
  select evidence.id, evidence.storage_path, evidence.processing_status,
         evidence.resolution_code, evidence.content_type, evidence.byte_size,
         evidence.sha256, upload.ticket_expires_at
    from public.integration_adapter_media_uploads upload
    join public.processing_jobs job
      on job.organization_id = upload.organization_id and job.id = upload.job_id
    join public.integration_webhook_events event
      on event.organization_id = job.organization_id and event.id = job.integration_event_id
    join public.integration_adapter_event_provenance provenance
      on provenance.organization_id = event.organization_id
     and provenance.integration_event_id = event.id
    join public.task_evidence evidence
      on evidence.organization_id = upload.organization_id and evidence.id = upload.evidence_id
   where upload.organization_id = v_credential.organization_id
     and upload.job_id = p_job_id
     and upload.media_external_id = p_media_external_id
     and event.integration_account_id = v_credential.integration_account_id
     and provenance.source = v_credential.source
     and evidence.site_id = v_credential.site_id
     and job.status = 'succeeded';
  if found then
    insert into public.integration_adapter_nonces (key_id,nonce)
      values (p_key_id,p_nonce) on conflict do nothing;
    if not found then
      raise exception using errcode = '23505', message = 'adapter_replay_detected';
    end if;
  end if;
end;
$$;
revoke execute on function public.get_adapter_media_upload(text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_adapter_media_upload(text,text,uuid,text)
  to service_role;

create function public.prepare_adapter_media_upload(
  p_key_id text, p_nonce text, p_job_id uuid, p_media_external_id text,
  p_retry boolean default false
)
returns table (
  evidence_id uuid, storage_path text,
  processing_status public.evidence_processing_status,
  resolution_code text, content_type text, byte_size bigint, sha256 text,
  ticket_expires_at timestamptz
)
language plpgsql security invoker set search_path = '' as $$
declare v_media record; v_new_path text;
begin
  select * into v_media from public.get_adapter_media_upload(
    p_key_id,p_nonce,p_job_id,p_media_external_id
  );
  if not found then return; end if;
  if v_media.processing_status in ('missing','quarantined') and p_retry then
    v_new_path := split_part(v_media.storage_path,'/',1) || '/' || gen_random_uuid()::text ||
      '/source.' || case v_media.content_type when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png' else 'webp' end;
    update public.task_evidence evidence
       set storage_path = v_new_path, processing_status = 'staged',
           linkage_status = 'unresolved', resolution_code = null, updated_at = now()
     where evidence.id = v_media.evidence_id
       and evidence.processing_status in ('missing','quarantined');
    insert into public.evidence_audit_events (
      organization_id,site_id,evidence_id,action,reason_code
    ) select evidence.organization_id,evidence.site_id,evidence.id,
             'evidence.retry','adapter_media_retry'
        from public.task_evidence evidence where evidence.id=v_media.evidence_id;
  end if;
  if v_media.processing_status = 'staged' or
     (v_media.processing_status in ('missing','quarantined') and p_retry) then
    update public.integration_adapter_media_uploads upload
       set ticket_expires_at = now() + interval '2 hours',
           retry_count = retry_count + case when p_retry then 1 else 0 end,
           updated_at = now()
     where upload.job_id=p_job_id and upload.media_external_id=p_media_external_id;
  end if;
  return query
  select evidence.id,evidence.storage_path,evidence.processing_status,
         evidence.resolution_code,evidence.content_type,evidence.byte_size,
         evidence.sha256,upload.ticket_expires_at
    from public.integration_adapter_media_uploads upload
    join public.task_evidence evidence
      on evidence.organization_id=upload.organization_id and evidence.id=upload.evidence_id
   where upload.job_id=p_job_id and upload.media_external_id=p_media_external_id
     and evidence.id=v_media.evidence_id;
end;
$$;
revoke execute on function public.prepare_adapter_media_upload(text,text,uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.prepare_adapter_media_upload(text,text,uuid,text,boolean)
  to service_role;

create function public.expire_adapter_media_uploads()
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_upload record; v_count integer := 0;
begin
  for v_upload in
    select upload.evidence_id
      from public.integration_adapter_media_uploads upload
      join public.task_evidence evidence
        on evidence.organization_id=upload.organization_id and evidence.id=upload.evidence_id
     where evidence.processing_status='staged'
       and coalesce(upload.ticket_expires_at,upload.created_at+interval '2 hours') <= now()
     for update of upload skip locked
  loop
    if public.mark_evidence_ingestion_problem(
      v_upload.evidence_id,'missing','adapter_media_timeout'
    ) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.expire_adapter_media_uploads() from public, anon, authenticated;
grant execute on function public.expire_adapter_media_uploads() to service_role;
