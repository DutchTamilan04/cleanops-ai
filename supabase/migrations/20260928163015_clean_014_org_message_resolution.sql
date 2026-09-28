-- CLEAN-014B: keep site-less intake restricted to an organization Director.
-- The exposed wrappers run as the caller; privileged reads and writes live in
-- private functions with an explicit membership check and empty search path.
create table public.external_message_site_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  context_id uuid not null,
  actor_user_id uuid not null,
  action text not null check (action in ('assign', 'reject')),
  site_id uuid,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  foreign key (organization_id, context_id)
    references public.external_message_contexts (organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict,
  check ((action = 'assign' and site_id is not null) or
         (action = 'reject' and site_id is null))
);
create index external_message_site_resolutions_context_idx
  on public.external_message_site_resolutions (organization_id, context_id, created_at desc);
alter table public.external_message_site_resolutions enable row level security;
revoke all on table public.external_message_site_resolutions from anon, authenticated;
grant all on table public.external_message_site_resolutions to service_role;

create function private.list_org_unassigned_messages(
  p_organization_id uuid, p_limit integer
)
returns table (
  context_id uuid, sender_id text, text_content text, occurred_at timestamptz,
  intent_kind text, resolution_status text, media_count bigint,
  forwarded_by text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.can_administer_org(p_organization_id) then
    raise exception using errcode = '42501', message = 'org_message_review_denied';
  end if;
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;
  return query
  select context.id, message.sender_id, message.text_content,
         message.occurred_at, context.intent_kind, context.resolution_status,
         (select count(*) from public.external_message_media media
           where media.organization_id = context.organization_id
             and media.external_message_id = context.external_message_id),
         provenance.forwarded_by
    from public.external_message_contexts context
    join public.external_messages message
      on message.organization_id = context.organization_id
     and message.id = context.external_message_id
    left join public.integration_adapter_event_provenance provenance
      on provenance.organization_id = message.organization_id
     and provenance.integration_event_id = message.integration_event_id
   where context.organization_id = p_organization_id
     and context.site_id is null
     and context.resolution_status in ('unresolved', 'suggested')
   order by context.updated_at desc, context.id desc
   limit p_limit;
end;
$$;
revoke execute on function private.list_org_unassigned_messages(uuid, integer)
  from public, anon;
grant execute on function private.list_org_unassigned_messages(uuid, integer)
  to authenticated, service_role;

create function public.list_org_unassigned_messages(
  p_organization_id uuid, p_limit integer default 25
)
returns table (
  context_id uuid, sender_id text, text_content text, occurred_at timestamptz,
  intent_kind text, resolution_status text, media_count bigint,
  forwarded_by text
)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_org_unassigned_messages(p_organization_id, p_limit);
$$;
revoke execute on function public.list_org_unassigned_messages(uuid, integer)
  from public, anon;
grant execute on function public.list_org_unassigned_messages(uuid, integer)
  to authenticated;

create function private.resolve_org_unassigned_message(
  p_organization_id uuid, p_context_id uuid, p_action text,
  p_site_id uuid, p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_context public.external_message_contexts%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_administer_org(p_organization_id) then
    raise exception using errcode = '42501', message = 'org_message_review_denied';
  end if;
  if p_action not in ('assign', 'reject') or
     char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 or
     (p_action = 'assign' and p_site_id is null) or
     (p_action = 'reject' and p_site_id is not null) then
    raise exception using errcode = '22023', message = 'invalid_site_resolution';
  end if;
  if p_action = 'assign' and not exists (
    select 1 from public.sites site
     where site.organization_id = p_organization_id and site.id = p_site_id
  ) then
    raise exception using errcode = '42501', message = 'site_not_in_organization';
  end if;

  select * into v_context
    from public.external_message_contexts context
   where context.organization_id = p_organization_id and context.id = p_context_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'message_context_not_found';
  end if;
  if v_context.site_id is not null or
     v_context.resolution_status not in ('unresolved', 'suggested') then
    raise exception using errcode = 'P0001', message = 'message_already_resolved';
  end if;

  update public.external_message_contexts context
     set site_id = case when p_action = 'assign' then p_site_id else null end,
         resolution_status = case when p_action = 'assign' then 'unresolved' else 'rejected' end,
         resolution_source = 'manual',
         resolved_at = case when p_action = 'reject' then now() else null end,
         updated_at = now()
   where context.id = p_context_id and context.organization_id = p_organization_id;
  insert into public.external_message_site_resolutions (
    organization_id, context_id, actor_user_id, action, site_id, reason
  ) values (
    p_organization_id, p_context_id, v_actor, p_action,
    case when p_action = 'assign' then p_site_id else null end,
    btrim(p_reason)
  );
end;
$$;
revoke execute on function private.resolve_org_unassigned_message(uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function private.resolve_org_unassigned_message(uuid, uuid, text, uuid, text)
  to authenticated;

create function public.resolve_org_unassigned_message(
  p_organization_id uuid, p_context_id uuid, p_action text,
  p_site_id uuid, p_reason text
)
returns void
language sql security invoker set search_path = '' as $$
  select private.resolve_org_unassigned_message(
    p_organization_id, p_context_id, p_action, p_site_id, p_reason
  );
$$;
revoke execute on function public.resolve_org_unassigned_message(uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.resolve_org_unassigned_message(uuid, uuid, text, uuid, text)
  to authenticated;
