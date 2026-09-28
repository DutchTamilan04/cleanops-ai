begin;
set local role service_role;
select * from public.complete_processing_job(
  :'job_id'::uuid, 'c014-concurrent',
  '[{"externalMessageId":"wamid.concurrent-c014","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-28T17:00:00Z","text":"Fuel receipt","mediaRefs":[],"schemaVersion":1}]'::jsonb
);
select pg_sleep(1);
commit;
