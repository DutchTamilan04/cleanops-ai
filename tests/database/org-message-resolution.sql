begin;
set local role service_role;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'd1630000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'org-unassigned-test', '{}'::jsonb, repeat('a', 64)
);
insert into public.integration_adapter_event_provenance (
  integration_event_id, organization_id, source, source_event_id,
  forwarded_by, synthetic
) values (
  'd1630000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'whatsapp', 'org-unassigned-test', 'synthetic-supervisor', true
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
) values
  ('e1630000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001',
   'd1630000-0000-4000-8000-000000000001',
   'org-unassigned-1', 'thread-1', 'unknown-worker', now(), now(),
   'Synthetic site unknown one', '[]'::jsonb),
  ('e1630000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001',
   'd1630000-0000-4000-8000-000000000001',
   'org-unassigned-2', 'thread-2', 'forwarded-worker', now(), now(),
   'Synthetic site unknown two', '[]'::jsonb);
update public.external_message_contexts
   set site_id = null, zone_id = null, task_run_id = null, resolution_status = 'unresolved'
 where external_message_id in (
   'e1630000-0000-4000-8000-000000000001',
   'e1630000-0000-4000-8000-000000000002'
 );

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists(select 1 from public.list_org_unassigned_messages('10000000-0000-4000-8000-000000000001')) then
    raise exception 'site supervisor read unassigned organization messages';
  end if;
exception when insufficient_privilege then
  if sqlerrm <> 'org_message_review_denied' then raise; end if;
end $$;
do $$ begin
  perform public.resolve_org_unassigned_message(
    '10000000-0000-4000-8000-000000000001',
    (select id from public.external_message_contexts
       where external_message_id = 'e1630000-0000-4000-8000-000000000001'),
    'assign', '40000000-0000-4000-8000-000000000001', 'Wrong role'
  );
  raise exception 'site supervisor assigned an unverified message';
exception when insufficient_privilege then
  if sqlerrm <> 'org_message_review_denied' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$ begin
  if exists(select 1 from public.list_org_unassigned_messages('10000000-0000-4000-8000-000000000001')) then
    raise exception 'other organization Director read unassigned messages';
  end if;
exception when insufficient_privilege then
  if sqlerrm <> 'org_message_review_denied' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare
  v_first uuid;
  v_second uuid;
begin
  select context_id into v_first from public.list_org_unassigned_messages(
    '10000000-0000-4000-8000-000000000001')
   where text_content = 'Synthetic site unknown one';
  select context_id into v_second from public.list_org_unassigned_messages(
    '10000000-0000-4000-8000-000000000001')
   where text_content = 'Synthetic site unknown two';
  if (select count(*) from public.list_org_unassigned_messages(
      '10000000-0000-4000-8000-000000000001')) < 2 then
    raise exception 'Director cannot see both unassigned messages';
  end if;
  if not exists (
    select 1 from public.list_org_unassigned_messages(
      '10000000-0000-4000-8000-000000000001')
    where context_id = v_first and sender_id = 'unknown-worker'
      and forwarded_by = 'synthetic-supervisor' and synthetic
  ) then
    raise exception 'organization review lost original sender or forwarding provenance';
  end if;
  begin
    perform public.resolve_org_unassigned_message(
      '10000000-0000-4000-8000-000000000001', v_first,
      'assign', '40000000-0000-4000-8000-000000000003', 'Other tenant site'
    );
    raise exception 'cross-tenant site assignment succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'site_not_in_organization' then raise; end if;
  end;
  perform public.resolve_org_unassigned_message(
    '10000000-0000-4000-8000-000000000001', v_first,
    'assign', '40000000-0000-4000-8000-000000000001', 'Verified receiving casino'
  );
  if (select count(*) from public.list_site_external_messages(
      '40000000-0000-4000-8000-000000000001', 25)) < 1 then
    raise exception 'assigned message did not enter site review';
  end if;
  if not exists (
    select 1 from public.list_site_external_messages(
      '40000000-0000-4000-8000-000000000001', 25)
    where message_id = 'e1630000-0000-4000-8000-000000000001'
      and sender_id = 'unknown-worker'
      and forwarded_by = 'synthetic-supervisor' and synthetic
  ) then
    raise exception 'site review lost original sender or forwarding provenance';
  end if;
  if (select resolution_status from public.external_message_contexts where id = v_first) <> 'unresolved' then
    raise exception 'site assignment prematurely confirmed task context';
  end if;
  begin
    perform public.resolve_org_unassigned_message(
      '10000000-0000-4000-8000-000000000001', v_first,
      'reject', null, 'Stale second reviewer'
    );
    raise exception 'stale site resolution overwrote first decision';
  exception when raise_exception then
    if sqlerrm <> 'message_already_resolved' then raise; end if;
  end;
  perform public.resolve_org_unassigned_message(
    '10000000-0000-4000-8000-000000000001', v_second,
    'reject', null, 'Cannot verify source account'
  );
  if exists(select 1 from public.list_org_unassigned_messages(
    '10000000-0000-4000-8000-000000000001')
    where context_id = v_second) then
    raise exception 'rejected message remained in the active inbox'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$ begin
  perform * from public.list_site_external_messages(
    '40000000-0000-4000-8000-000000000001', 25);
  raise exception 'other organization Director read site message provenance';
exception when insufficient_privilege then null;
end $$;

reset role;
set local role service_role;
do $$ begin
  if (select count(*) from public.external_message_site_resolutions
      where context_id in (select id from public.external_message_contexts
        where external_message_id in (
          'e1630000-0000-4000-8000-000000000001',
          'e1630000-0000-4000-8000-000000000002'))) <> 2 then
    raise exception 'site resolution audit was incomplete';
  end if;
end $$;
rollback;
