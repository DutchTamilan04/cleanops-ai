set role service_role;
do $$
declare v_message_id uuid;
begin
  select id into v_message_id from public.external_messages
   where integration_account_id = 'c9500000-0000-4000-8000-000000000001'
     and external_message_id = 'wamid.concurrent-c014';
  if v_message_id is null
     or (select count(*) from public.external_messages
          where external_message_id='wamid.concurrent-c014') <> 1
     or (select count(*) from public.integration_message_deliveries
          where normalized_message_id=v_message_id) <> 2
     or (select count(*) from public.finance_intake_items
          where source_message_id=v_message_id) <> 1
     or (select count(*) from public.processing_jobs
          where id in ('c9500000-0000-4000-8000-000000000021',
                       'c9500000-0000-4000-8000-000000000022')
            and status='succeeded') <> 2 then
    raise exception 'concurrent transports did not converge on one normalized message';
  end if;
end;
$$;
