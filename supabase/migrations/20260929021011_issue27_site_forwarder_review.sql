-- Reviewers need the forwarding and synthetic provenance after a Director
-- assigns a site. Raw events and provenance remain service-only tables.
drop function public.list_site_external_messages(uuid, integer, uuid);
create function public.list_site_external_messages(
  p_site_id uuid,
  p_limit integer default 25,
  p_actor_user_id uuid default null
)
returns table (
  message_id uuid, sender_id text, text_content text, occurred_at timestamptz,
  forwarded_by text, synthetic boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;
  select site.organization_id into v_organization_id
    from public.sites site where site.id = p_site_id;
  if v_organization_id is null then
    raise exception using errcode = 'P0001', message = 'site_not_found';
  end if;
  perform private.resolve_review_actor(v_organization_id, p_site_id, p_actor_user_id);

  return query
  select message.id, message.sender_id, message.text_content, message.occurred_at,
         provenance.forwarded_by, coalesce(provenance.synthetic, false)
    from public.external_messages message
    join public.external_message_contexts context
      on context.organization_id = message.organization_id
     and context.external_message_id = message.id
    left join public.integration_adapter_event_provenance provenance
      on provenance.organization_id = message.organization_id
     and provenance.integration_event_id = message.integration_event_id
   where message.organization_id = v_organization_id
     and context.site_id = p_site_id
   order by message.occurred_at desc, message.id desc
   limit p_limit;
end;
$$;
revoke execute on function public.list_site_external_messages(uuid, integer, uuid)
  from public, anon;
grant execute on function public.list_site_external_messages(uuid, integer, uuid)
  to authenticated, service_role;

-- The organization inbox already displayed forwarded_by. Add the synthetic
-- marker through the same Director-only read gate.
drop function public.list_org_unassigned_messages(uuid, integer);
drop function private.list_org_unassigned_messages(uuid, integer);
create function private.list_org_unassigned_messages(
  p_organization_id uuid, p_limit integer
)
returns table (
  context_id uuid, sender_id text, text_content text, occurred_at timestamptz,
  intent_kind text, resolution_status text, media_count bigint,
  forwarded_by text, synthetic boolean
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
         provenance.forwarded_by, coalesce(provenance.synthetic, false)
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
  forwarded_by text, synthetic boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_org_unassigned_messages(p_organization_id, p_limit);
$$;
revoke execute on function public.list_org_unassigned_messages(uuid, integer)
  from public, anon;
grant execute on function public.list_org_unassigned_messages(uuid, integer)
  to authenticated;

-- Generic signed adapters can be non-WhatsApp sources. Retain their message
-- link without incorrectly labelling the resulting finance draft WhatsApp.
alter table public.finance_intake_items
  drop constraint finance_intake_items_source_kind_check,
  drop constraint finance_intake_items_check,
  add constraint finance_intake_items_source_kind_check
    check (source_kind in ('whatsapp', 'adapter', 'app')),
  add constraint finance_intake_items_check
    check ((source_kind in ('whatsapp', 'adapter')
      and source_message_id is not null and submitted_by is null)
      or (source_kind = 'app' and source_message_id is null and submitted_by is not null));

-- Keep the finance draft trigger aligned with the review-only finance intent.
-- A supply request or an equipment repair report without an expense/receipt
-- keyword is not itself a financial claim.
create or replace function private.capture_finance_message_candidate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_site_id uuid;
  v_source_kind text;
begin
  if coalesce(new.text_content, '') !~*
    '(^|[^a-z])(expense|receipt|fuel|meal|lunch|parking|toll)([^a-z]|$)' then
    return new;
  end if;
  select account.site_id,
         case when account.provider = 'event_adapter'
                   and provenance.source is distinct from 'whatsapp'
              then 'adapter' else 'whatsapp' end
    into v_site_id, v_source_kind
    from public.integration_accounts account
    left join public.integration_adapter_event_provenance provenance
      on provenance.organization_id = new.organization_id
     and provenance.integration_event_id = new.integration_event_id
   where account.organization_id = new.organization_id
     and account.id = new.integration_account_id;
  insert into public.finance_intake_items (
    organization_id, site_id, source_kind, source_message_id,
    source_text, review_state
  ) values (
    new.organization_id, v_site_id, v_source_kind, new.id,
    coalesce(new.text_content, ''),
    case when v_site_id is null then 'needs_review' else 'pending' end
  )
  on conflict (organization_id, source_message_id, classifier_version) do nothing;
  return new;
end;
$$;
