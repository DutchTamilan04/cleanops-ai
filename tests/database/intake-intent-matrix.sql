begin;
set local role service_role;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values (
  'c9800000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'event_adapter', 'synthetic-email-source', 'Synthetic email intake test'
);
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'd9800000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c9800000-0000-4000-8000-000000000001',
  'intent-matrix-test', '{}'::jsonb, repeat('a', 64)
);
insert into public.integration_adapter_event_provenance (
  integration_event_id, organization_id, source, source_event_id, synthetic
) values (
  'd9800000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'email', 'intent-matrix-test', true
);

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
)
select source.id::uuid, '10000000-0000-4000-8000-000000000001'::uuid,
       'c9800000-0000-4000-8000-000000000001'::uuid,
       'd9800000-0000-4000-8000-000000000001'::uuid,
       source.message_id, 'synthetic-thread', 'synthetic-sender', now(), now(),
       source.message_text, '[]'::jsonb
  from (values
    ('e9800000-0000-4000-8000-000000000001', 'intent-finance', 'Fuel receipt for test job'),
    ('e9800000-0000-4000-8000-000000000002', 'intent-absence', 'Worker sick call-out'),
    ('e9800000-0000-4000-8000-000000000003', 'intent-supply', 'Need supplies for site'),
    ('e9800000-0000-4000-8000-000000000004', 'intent-equipment', 'Machine broken'),
    ('e9800000-0000-4000-8000-000000000005', 'intent-complaint', 'Customer complaint'),
    ('e9800000-0000-4000-8000-000000000006', 'intent-notice', 'Received notice'),
    ('e9800000-0000-4000-8000-000000000007', 'intent-evidence', '#before photo for lobby'),
    ('e9800000-0000-4000-8000-000000000008', 'intent-unknown', 'Routine update')
  ) as source(id, message_id, message_text);

do $$
declare
  v_case record;
begin
  for v_case in
    select * from (values
      ('e9800000-0000-4000-8000-000000000001'::uuid, 'finance_candidate'),
      ('e9800000-0000-4000-8000-000000000002'::uuid, 'absence'),
      ('e9800000-0000-4000-8000-000000000003'::uuid, 'supply_request'),
      ('e9800000-0000-4000-8000-000000000004'::uuid, 'equipment_issue'),
      ('e9800000-0000-4000-8000-000000000005'::uuid, 'complaint'),
      ('e9800000-0000-4000-8000-000000000006'::uuid, 'announcement_ack'),
      ('e9800000-0000-4000-8000-000000000007'::uuid, 'task_evidence'),
      ('e9800000-0000-4000-8000-000000000008'::uuid, 'unknown')
    ) as cases(message_id, expected_intent)
  loop
    if (select intent_kind from public.external_message_contexts
        where external_message_id = v_case.message_id) is distinct from v_case.expected_intent then
      raise exception 'wrong review intent for %', v_case.message_id;
    end if;
  end loop;
  if (select count(*) from public.finance_intake_items
      where source_message_id in (select id from public.external_messages
        where integration_event_id = 'd9800000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'non-finance operational message created a finance draft';
  end if;
  if not exists (select 1 from public.finance_intake_items
      where source_message_id = 'e9800000-0000-4000-8000-000000000001'
        and source_kind = 'adapter' and review_state = 'pending') then
    raise exception 'non-WhatsApp adapter receipt lost source or draft status';
  end if;
  if exists (select 1 from public.expense_claims claim
      join public.finance_intake_items intake on intake.id = claim.intake_id
      where intake.source_message_id = 'e9800000-0000-4000-8000-000000000001') then
    raise exception 'message classification posted an expense';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
declare
  v_app_intake_id uuid;
begin
  v_app_intake_id := public.submit_app_finance_intake(
    '40000000-0000-4000-8000-000000000001', 'Fuel receipt from synthetic app test'
  );
  if v_app_intake_id is null then
    raise exception 'app submission returned no draft ID';
  end if;
  perform set_config('cleanops.test_app_intake_id', v_app_intake_id::text, true);
end;
$$;

reset role;
set local role service_role;
do $$
declare
  v_app_intake_id uuid := current_setting('cleanops.test_app_intake_id')::uuid;
begin
  if not exists (select 1 from public.finance_intake_items
      where id = v_app_intake_id and source_kind = 'app'
        and review_state = 'pending') then
    raise exception 'app submission did not enter the same draft review state';
  end if;
  if exists (select 1 from public.expense_claims where intake_id = v_app_intake_id) then
    raise exception 'app submission posted an expense without review';
  end if;
end;
$$;
rollback;
