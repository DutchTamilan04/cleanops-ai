-- CLEAN-014C: a service-configured, exact WhatsApp account binding is the only
-- cross-provider alias. Different organizations, sites and phone IDs cannot bind.
create table public.integration_adapter_canonical_bindings (
  organization_id uuid not null,
  adapter_account_id uuid not null,
  source text not null check (source = 'whatsapp'),
  canonical_account_id uuid not null,
  verification_reference text not null check (char_length(verification_reference) between 3 and 255),
  verified_at timestamptz not null default now(),
  primary key (organization_id, adapter_account_id, source),
  foreign key (organization_id, adapter_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, canonical_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade
);
alter table public.integration_adapter_canonical_bindings enable row level security;
revoke all on public.integration_adapter_canonical_bindings from anon, authenticated;
grant all on public.integration_adapter_canonical_bindings to service_role;

create function public.validate_adapter_canonical_binding()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_adapter public.integration_accounts%rowtype;
  v_canonical public.integration_accounts%rowtype;
begin
  select * into v_adapter from public.integration_accounts
    where organization_id = new.organization_id and id = new.adapter_account_id;
  select * into v_canonical from public.integration_accounts
    where organization_id = new.organization_id and id = new.canonical_account_id;
  if v_adapter.provider is distinct from 'event_adapter'::public.integration_provider
     or v_canonical.provider is distinct from 'whatsapp_cloud_api'::public.integration_provider
     or v_adapter.site_id is null or v_adapter.site_id is distinct from v_canonical.site_id
     or v_adapter.external_account_id is distinct from v_canonical.external_account_id
     or not v_adapter.enabled or not v_canonical.enabled
     or not exists (
       select 1 from public.integration_adapter_credentials credential
        where credential.organization_id = new.organization_id
          and credential.integration_account_id = new.adapter_account_id
          and credential.source = new.source and credential.enabled
     ) then
    raise exception using errcode = '42501', message = 'adapter_binding_scope_denied';
  end if;
  if exists (
    select 1 from public.external_messages message
     where message.organization_id = new.organization_id
       and message.integration_account_id = new.adapter_account_id
  ) then
    raise exception using errcode = '23514', message = 'adapter_binding_requires_reconciliation';
  end if;
  return new;
end;
$$;
create trigger integration_adapter_canonical_binding_guard
before insert or update on public.integration_adapter_canonical_bindings
for each row execute function public.validate_adapter_canonical_binding();
revoke execute on function public.validate_adapter_canonical_binding() from public, anon, authenticated;
grant execute on function public.validate_adapter_canonical_binding() to service_role;

alter table public.integration_webhook_events
  add column transport text not null default 'legacy'
  check (transport in ('legacy', 'meta_webhook', 'make_relay', 'signed_adapter'));

-- The adapter provenance insert and transport marker share one acceptance
-- transaction. A replay of the same adapter message still returns its event.
create function public.mark_adapter_event_transport()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.integration_webhook_events
     set transport = 'signed_adapter'
   where organization_id = new.organization_id and id = new.integration_event_id;
  return new;
end;
$$;
create trigger adapter_event_transport_marker
after insert on public.integration_adapter_event_provenance
for each row execute function public.mark_adapter_event_transport();
revoke execute on function public.mark_adapter_event_transport() from public, anon, authenticated;
grant execute on function public.mark_adapter_event_transport() to service_role;

-- The five-argument RPC is used by the authenticated Meta and Make routes.
-- Keep the existing four-argument RPC for older service clients and fixtures.
create function public.accept_whatsapp_ingress_event(
  p_external_account_id text, p_dedupe_key text, p_payload jsonb,
  p_payload_sha256 text, p_transport text
)
returns table (event_id uuid, job_id uuid, duplicate boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.integration_accounts%rowtype;
  v_event_id uuid;
  v_job_id uuid;
  v_inserted boolean := false;
  v_existing_sha text;
begin
  if p_transport not in ('meta_webhook', 'make_relay')
     or p_dedupe_key is null or char_length(p_dedupe_key) not between 1 and 255
     or jsonb_typeof(p_payload) <> 'object'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_whatsapp_envelope';
  end if;
  select * into v_account from public.integration_accounts
    where provider = 'whatsapp_cloud_api' and external_account_id = p_external_account_id and enabled;
  if not found then raise exception using errcode = 'P0001', message = 'integration_account_not_found'; end if;
  insert into public.integration_webhook_events (
    organization_id, integration_account_id, dedupe_key, payload, payload_sha256, transport
  ) values (
    v_account.organization_id, v_account.id, p_dedupe_key, p_payload, p_payload_sha256, p_transport
  ) on conflict (integration_account_id, dedupe_key) do nothing returning id into v_event_id;
  if v_event_id is null then
    select id, payload_sha256 into v_event_id, v_existing_sha
      from public.integration_webhook_events
     where integration_account_id = v_account.id and dedupe_key = p_dedupe_key;
    if v_existing_sha is distinct from p_payload_sha256 then
      raise exception using errcode = '23505', message = 'whatsapp_envelope_identity_conflict';
    end if;
  else
    v_inserted := true;
  end if;
  insert into public.processing_jobs (organization_id, integration_event_id, kind, dedupe_key)
    values (v_account.organization_id, v_event_id, 'normalize_external_messages', p_dedupe_key)
    on conflict (organization_id, kind, dedupe_key) do nothing returning id into v_job_id;
  if v_job_id is null then
    select id into v_job_id from public.processing_jobs
     where organization_id = v_account.organization_id and kind = 'normalize_external_messages'
       and dedupe_key = p_dedupe_key;
  end if;
  return query select v_event_id, v_job_id, not v_inserted;
end;
$$;
revoke execute on function public.accept_whatsapp_ingress_event(text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_whatsapp_ingress_event(text, text, jsonb, text, text)
  to service_role;

create table public.integration_message_deliveries (
  organization_id uuid not null,
  integration_event_id uuid not null,
  provider_message_id text not null,
  normalized_message_id uuid not null,
  source_account_id uuid not null,
  transport text not null check (transport in ('legacy', 'meta_webhook', 'make_relay', 'signed_adapter')),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (integration_event_id, provider_message_id),
  foreign key (organization_id, integration_event_id)
    references public.integration_webhook_events (organization_id, id) on delete cascade,
  foreign key (organization_id, normalized_message_id)
    references public.external_messages (organization_id, id) on delete cascade,
  foreign key (organization_id, source_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade
);
create index integration_message_deliveries_normalized_idx
  on public.integration_message_deliveries (organization_id, normalized_message_id, created_at);
alter table public.integration_message_deliveries enable row level security;
revoke all on public.integration_message_deliveries from anon, authenticated;
grant all on public.integration_message_deliveries to service_role;

create function public.canonicalize_adapter_message_account()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_source text;
  v_binding public.integration_adapter_canonical_bindings%rowtype;
  v_adapter public.integration_accounts%rowtype;
  v_canonical public.integration_accounts%rowtype;
begin
  select provenance.source into v_source
    from public.integration_adapter_event_provenance provenance
   where provenance.organization_id = new.organization_id
     and provenance.integration_event_id = new.integration_event_id;
  if v_source is null then return new; end if;
  select * into v_binding from public.integration_adapter_canonical_bindings
   where organization_id = new.organization_id
     and adapter_account_id = new.integration_account_id and source = v_source;
  if not found then return new; end if;
  select * into v_adapter from public.integration_accounts
   where organization_id = new.organization_id and id = new.integration_account_id;
  select * into v_canonical from public.integration_accounts
   where organization_id = new.organization_id and id = v_binding.canonical_account_id;
  if v_adapter.provider is distinct from 'event_adapter'::public.integration_provider
     or v_canonical.provider is distinct from 'whatsapp_cloud_api'::public.integration_provider
     or not v_adapter.enabled or not v_canonical.enabled
     or v_adapter.site_id is null or v_adapter.site_id is distinct from v_canonical.site_id
     or v_adapter.external_account_id is distinct from v_canonical.external_account_id then
    raise exception using errcode = '42501', message = 'adapter_binding_invalid';
  end if;
  new.integration_account_id := v_canonical.id;
  return new;
end;
$$;
create trigger external_messages_canonicalize_adapter
before insert on public.external_messages
for each row execute function public.canonicalize_adapter_message_account();
revoke execute on function public.canonicalize_adapter_message_account() from public, anon, authenticated;
grant execute on function public.canonicalize_adapter_message_account() to service_role;

-- A completed delivery is linked only after its canonical row matches every
-- identity-bearing field. Raising aborts this completion transaction, so the
-- first message and its domain draft remain unchanged.
create function public.record_normalized_message_delivery()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.integration_webhook_events%rowtype;
  v_message jsonb;
  v_row public.external_messages%rowtype;
  v_account_id uuid;
  v_binding public.integration_adapter_canonical_bindings%rowtype;
  v_source text;
begin
  select * into strict v_event from public.integration_webhook_events
   where organization_id = new.organization_id and id = new.integration_event_id;
  v_account_id := v_event.integration_account_id;
  select source into v_source from public.integration_adapter_event_provenance
   where organization_id = new.organization_id and integration_event_id = v_event.id;
  if v_source is not null then
    select * into v_binding from public.integration_adapter_canonical_bindings
     where organization_id = new.organization_id
       and adapter_account_id = v_account_id and source = v_source;
    if found then v_account_id := v_binding.canonical_account_id; end if;
  end if;
  for v_message in select value from jsonb_array_elements(v_event.payload -> 'messages') loop
    select * into v_row from public.external_messages
     where integration_account_id = v_account_id
       and external_message_id = v_message ->> 'externalMessageId';
    if not found or v_row.organization_id is distinct from new.organization_id
       or v_row.external_thread_id is distinct from v_message ->> 'externalThreadId'
       or v_row.sender_id is distinct from v_message ->> 'senderId'
       or v_row.occurred_at is distinct from (v_message ->> 'occurredAt')::timestamptz
       or v_row.text_content is distinct from nullif(v_message ->> 'text', '')
       or v_row.media_refs is distinct from coalesce(v_message -> 'mediaRefs', '[]'::jsonb)
       or v_row.schema_version is distinct from coalesce((v_message ->> 'schemaVersion')::smallint, 1) then
      raise exception using errcode = '23505', message = 'logical_message_conflict';
    end if;
    insert into public.integration_message_deliveries (
      organization_id, integration_event_id, provider_message_id,
      normalized_message_id, source_account_id, transport, payload_sha256
    ) values (
      new.organization_id, v_event.id, v_message ->> 'externalMessageId',
      v_row.id, v_event.integration_account_id, v_event.transport, v_event.payload_sha256
    ) on conflict (integration_event_id, provider_message_id) do nothing;
  end loop;
  return new;
end;
$$;
create trigger processing_jobs_record_message_delivery
after update of status on public.processing_jobs
for each row when (new.status = 'succeeded' and old.status is distinct from new.status)
execute function public.record_normalized_message_delivery();
revoke execute on function public.record_normalized_message_delivery() from public, anon, authenticated;
grant execute on function public.record_normalized_message_delivery() to service_role;

-- Identity conflicts are permanent: replaying cannot make a different body
-- become the first accepted message. Preserve a scoped, reviewable job code.
create or replace function public.fail_processing_job(
  p_job_id uuid, p_worker_id text, p_error_code text,
  p_retry_delay_seconds integer default 30
)
returns public.processing_job_status
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.processing_jobs%rowtype;
  v_status public.processing_job_status;
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_error_code';
  end if;
  if p_retry_delay_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_retry_delay';
  end if;
  select job.* into v_job from public.processing_jobs job
   where job.id = p_job_id for update;
  if not found or v_job.status <> 'processing' or v_job.lease_owner <> p_worker_id
     or v_job.lease_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'job_not_owned';
  end if;
  v_status := case
    when p_error_code in ('logical_message_conflict', 'adapter_binding_invalid')
      or v_job.attempt_count >= v_job.max_attempts then 'failed'
    else 'pending' end;
  update public.processing_jobs job
     set status = v_status,
         next_attempt_at = case when v_status = 'pending'
           then now() + make_interval(secs => p_retry_delay_seconds)
           else job.next_attempt_at end,
         lease_owner = null, lease_expires_at = null,
         last_error_code = p_error_code, updated_at = now()
   where job.id = v_job.id;
  update public.integration_webhook_events event
     set status = case when v_status = 'failed'
           then 'failed'::public.integration_event_status
           else 'pending'::public.integration_event_status end,
         last_error_code = p_error_code
   where event.id = v_job.integration_event_id;
  return v_status;
end;
$$;
