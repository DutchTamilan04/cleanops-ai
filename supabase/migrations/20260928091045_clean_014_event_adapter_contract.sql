-- CLEAN-014: credentials bind a server-held HMAC key ID to one registered
-- account and its site. Secrets are never stored in the database.
create table public.integration_adapter_credentials (
  key_id text primary key check (key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  organization_id uuid not null,
  integration_account_id uuid not null,
  site_id uuid not null,
  source text not null check (source ~ '^[a-z][a-z0-9_-]{1,39}$'),
  capabilities text[] not null default array['message:write']::text[]
    check (capabilities <@ array['message:write', 'status:read']::text[]),
  enabled boolean not null default true,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict,
  check (expires_at is null or expires_at > valid_from)
);

create table public.integration_adapter_nonces (
  key_id text not null references public.integration_adapter_credentials (key_id) on delete cascade,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_at timestamptz not null default now(),
  primary key (key_id, nonce)
);
create index integration_adapter_nonces_created_idx
  on public.integration_adapter_nonces (created_at);

create table public.integration_adapter_event_provenance (
  integration_event_id uuid primary key references public.integration_webhook_events (id) on delete cascade,
  organization_id uuid not null,
  source text not null,
  source_event_id text not null,
  parent_reference text,
  forwarded_by text,
  synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (organization_id, integration_event_id)
    references public.integration_webhook_events (organization_id, id) on delete cascade
);

alter table public.integration_adapter_credentials enable row level security;
alter table public.integration_adapter_nonces enable row level security;
alter table public.integration_adapter_event_provenance enable row level security;
revoke all on table public.integration_adapter_credentials, public.integration_adapter_nonces,
  public.integration_adapter_event_provenance
  from anon, authenticated;
grant all on table public.integration_adapter_credentials, public.integration_adapter_nonces,
  public.integration_adapter_event_provenance
  to service_role;

create function public.accept_adapter_ingress_event(
  p_key_id text,
  p_source text,
  p_external_account_id text,
  p_external_event_id text,
  p_nonce text,
  p_payload jsonb,
  p_payload_sha256 text,
  p_provenance jsonb
)
returns table (event_id uuid, job_id uuid, duplicate boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_credential public.integration_adapter_credentials%rowtype;
  v_account public.integration_accounts%rowtype;
  v_event_id uuid;
  v_job_id uuid;
  v_existing_sha text;
  v_inserted boolean := false;
  v_message_id text;
  v_dedupe_key text;
begin
  if p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_payload) <> 'object'
     or p_nonce !~ '^[A-Za-z0-9_-]{16,128}$'
     or char_length(coalesce(p_external_event_id, '')) not between 1 and 255
     or jsonb_typeof(p_payload -> 'messages') <> 'array'
     or jsonb_array_length(p_payload -> 'messages') <> 1
     or jsonb_typeof(p_provenance) <> 'object'
     or coalesce(p_provenance ->> 'synthetic', 'false') not in ('true', 'false') then
    raise exception using errcode = '22023', message = 'invalid_adapter_envelope';
  end if;

  select credential.* into v_credential
    from public.integration_adapter_credentials credential
   where credential.key_id = p_key_id
     and credential.source = p_source
     and credential.enabled
     and credential.valid_from <= now()
     and (credential.expires_at is null or credential.expires_at > now())
     and 'message:write' = any(credential.capabilities);
  if not found then
    raise exception using errcode = '42501', message = 'adapter_credential_not_authorized';
  end if;

  select account.* into v_account
    from public.integration_accounts account
   where account.id = v_credential.integration_account_id
     and account.organization_id = v_credential.organization_id
     and account.site_id = v_credential.site_id
     and account.provider = 'event_adapter'
     and account.external_account_id = p_external_account_id
     and account.enabled;
  if not found then
    raise exception using errcode = '42501', message = 'adapter_account_not_authorized';
  end if;

  v_message_id := p_payload #>> '{messages,0,externalMessageId}';
  if char_length(coalesce(v_message_id, '')) not between 1 and 255
     or p_payload ->> 'accountExternalId' <> v_account.external_account_id then
    raise exception using errcode = '22023', message = 'invalid_adapter_envelope';
  end if;

  -- A nonce is consumed in the same transaction as event and job creation.
  insert into public.integration_adapter_nonces (key_id, nonce)
    values (p_key_id, p_nonce)
    on conflict do nothing;
  if not found then
    raise exception using errcode = '23505', message = 'adapter_replay_detected';
  end if;

  -- Message identity is stable across Make/provider retries and batch boundaries.
  v_dedupe_key := 'adapter:' || md5(p_source || ':' || v_message_id);
  insert into public.integration_webhook_events (
    organization_id, integration_account_id, provider_event_id,
    dedupe_key, payload, payload_sha256
  ) values (
    v_account.organization_id, v_account.id, p_external_event_id,
    v_dedupe_key, p_payload, p_payload_sha256
  )
  on conflict (integration_account_id, dedupe_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select event.id, event.payload_sha256
      into v_event_id, v_existing_sha
      from public.integration_webhook_events event
     where event.integration_account_id = v_account.id
       and event.dedupe_key = v_dedupe_key;
    if v_existing_sha <> p_payload_sha256 then
      raise exception using errcode = '23505', message = 'adapter_message_identity_conflict';
    end if;
  else
    v_inserted := true;
  end if;

  insert into public.processing_jobs (organization_id, integration_event_id, kind, dedupe_key)
    values (v_account.organization_id, v_event_id, 'normalize_external_messages', v_dedupe_key)
    on conflict (organization_id, kind, dedupe_key) do nothing
    returning id into v_job_id;
  if v_job_id is null then
    select job.id into v_job_id from public.processing_jobs job
     where job.organization_id = v_account.organization_id
       and job.kind = 'normalize_external_messages'
       and job.dedupe_key = v_dedupe_key;
  end if;
  if v_inserted then
    insert into public.integration_adapter_event_provenance (
      integration_event_id, organization_id, source, source_event_id,
      parent_reference, forwarded_by, synthetic
    ) values (
      v_event_id, v_account.organization_id, p_source, p_external_event_id,
      nullif(p_provenance ->> 'parentReference', ''),
      nullif(p_provenance ->> 'forwardedBy', ''),
      coalesce((p_provenance ->> 'synthetic')::boolean, false)
    );
  end if;
  return query select v_event_id, v_job_id, not v_inserted;
end;
$$;

create function public.get_adapter_ingress_status(p_key_id text, p_job_id uuid)
returns table (
  event_id uuid, job_id uuid, status public.processing_job_status,
  attempt_count smallint, last_error_code text, created_at timestamptz,
  completed_at timestamptz
)
language sql security invoker set search_path = '' as $$
  select event.id, job.id, job.status, job.attempt_count,
         job.last_error_code, job.created_at, job.completed_at
    from public.integration_adapter_credentials credential
    join public.integration_accounts account
      on account.organization_id = credential.organization_id
     and account.id = credential.integration_account_id
     and account.site_id = credential.site_id
    join public.integration_webhook_events event
      on event.organization_id = account.organization_id
     and event.integration_account_id = account.id
    join public.processing_jobs job
      on job.organization_id = event.organization_id
     and job.integration_event_id = event.id
   where credential.key_id = p_key_id
     and credential.enabled
     and credential.valid_from <= now()
     and (credential.expires_at is null or credential.expires_at > now())
     and 'status:read' = any(credential.capabilities)
     and account.provider = 'event_adapter'
     and account.enabled
     and job.id = p_job_id;
$$;

create function public.get_adapter_queue_health()
returns table (
  pending_count bigint, processing_count bigint, failed_count bigint,
  oldest_pending_at timestamptz
)
language sql security invoker set search_path = '' as $$
  select count(*) filter (where job.status = 'pending'),
         count(*) filter (where job.status = 'processing'),
         count(*) filter (where job.status = 'failed'),
         min(job.created_at) filter (where job.status = 'pending')
    from public.processing_jobs job
    join public.integration_webhook_events event
      on event.organization_id = job.organization_id
     and event.id = job.integration_event_id
    join public.integration_accounts account
      on account.organization_id = event.organization_id
     and account.id = event.integration_account_id
   where account.provider = 'event_adapter';
$$;

create function public.retry_failed_adapter_processing_job(p_job_id uuid)
returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.processing_jobs job
    join public.integration_webhook_events event
      on event.organization_id = job.organization_id
     and event.id = job.integration_event_id
    join public.integration_accounts account
      on account.organization_id = event.organization_id
     and account.id = event.integration_account_id
   where job.id = p_job_id and account.provider = 'event_adapter'
  ) then return false; end if;
  return public.retry_failed_processing_job(p_job_id);
end;
$$;

-- The adapter worker may claim only adapter jobs. The WhatsApp worker owns
-- provider media handling and must never be preempted by this generic worker.
create function public.claim_adapter_processing_job(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  job_id uuid, integration_event_id uuid, organization_id uuid,
  integration_account_id uuid, payload jsonb, attempt_count smallint,
  lease_expires_at timestamptz
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.processing_jobs%rowtype;
  v_event public.integration_webhook_events%rowtype;
begin
  if char_length(coalesce(p_worker_id, '')) not between 1 and 120
     or p_lease_seconds not between 5 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_worker_request';
  end if;

  with exhausted as (
    update public.processing_jobs job
       set status = 'failed', lease_owner = null, lease_expires_at = null,
           last_error_code = 'attempts_exhausted', updated_at = now()
     where job.status = 'processing'
       and job.lease_expires_at <= now()
       and job.attempt_count >= job.max_attempts
       and exists (
         select 1 from public.integration_webhook_events event
         join public.integration_accounts account
           on account.id = event.integration_account_id
          and account.organization_id = event.organization_id
         where event.id = job.integration_event_id
           and account.provider = 'event_adapter'
       )
     returning job.integration_event_id
  )
  update public.integration_webhook_events event
     set status = 'failed', last_error_code = 'attempts_exhausted'
   where event.id in (select exhausted.integration_event_id from exhausted);

  select job.* into v_job
    from public.processing_jobs job
    join public.integration_webhook_events event
      on event.organization_id = job.organization_id
     and event.id = job.integration_event_id
    join public.integration_accounts account
      on account.organization_id = event.organization_id
     and account.id = event.integration_account_id
   where account.provider = 'event_adapter'
     and ((job.status = 'pending' and job.next_attempt_at <= now())
       or (job.status = 'processing' and job.lease_expires_at <= now()))
     and job.attempt_count < job.max_attempts
   order by job.next_attempt_at, job.created_at, job.id
   for update of job skip locked
   limit 1;
  if not found then return; end if;

  update public.processing_jobs job
     set status = 'processing', attempt_count = job.attempt_count + 1,
         lease_owner = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where job.id = v_job.id
   returning job.* into v_job;
  select event.* into strict v_event from public.integration_webhook_events event
   where event.id = v_job.integration_event_id;
  return query select v_job.id, v_event.id, v_job.organization_id,
    v_event.integration_account_id, v_event.payload, v_job.attempt_count,
    v_job.lease_expires_at;
end;
$$;

revoke execute on function public.accept_adapter_ingress_event(text,text,text,text,text,jsonb,text,jsonb),
  public.get_adapter_ingress_status(text,uuid),
  public.claim_adapter_processing_job(text,integer),
  public.get_adapter_queue_health(),
  public.retry_failed_adapter_processing_job(uuid) from public, anon, authenticated;
grant execute on function public.accept_adapter_ingress_event(text,text,text,text,text,jsonb,text,jsonb),
  public.get_adapter_ingress_status(text,uuid),
  public.claim_adapter_processing_job(text,integer),
  public.get_adapter_queue_health(),
  public.retry_failed_adapter_processing_job(uuid) to service_role;

-- Classification is a review hint only. It never approves, posts, or
-- authorizes a domain action. Existing finance candidate creation remains
-- owned by CLEAN-035 and its one-candidate-per-message constraint.
alter table public.external_message_contexts
  add column intent_kind text not null default 'unknown'
    check (intent_kind in (
      'task_evidence', 'finance_candidate', 'absence', 'supply_request',
      'equipment_issue', 'complaint', 'announcement_ack', 'unknown'
    ));

create function private.classify_external_message_intent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_text text := coalesce(new.text_content, '');
  v_intent text := 'unknown';
begin
  v_intent := case
    when v_text ~* '(^|[^a-z])(expense|receipt|fuel|meal|lunch|parking|toll)([^a-z]|$)'
      then 'finance_candidate'
    when v_text ~* '(^|[^a-z])(absent|absence|sick|call[ -]?out)([^a-z]|$)'
      then 'absence'
    when v_text ~* '(supply request|need supplies|stock low)'
      then 'supply_request'
    when v_text ~* '(equipment issue|machine broken|scrubber broken)'
      then 'equipment_issue'
    when v_text ~* '(^|[^a-z])(complaint)([^a-z]|$)'
      then 'complaint'
    when v_text ~* '(acknowledge|received notice)'
      then 'announcement_ack'
    when v_text ~* '(#before|#after|cleaning complete)'
      then 'task_evidence'
    else 'unknown'
  end;
  update public.external_message_contexts context
     set intent_kind = v_intent
   where context.organization_id = new.organization_id
     and context.external_message_id = new.id;
  return new;
end;
$$;
revoke execute on function private.classify_external_message_intent()
  from public, anon, authenticated;
create trigger zz_external_message_classify_intent
  after insert on public.external_messages
  for each row execute function private.classify_external_message_intent();
