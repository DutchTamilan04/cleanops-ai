-- CLEAN-014D: service-only queue signals for the hosted adapter worker.
-- No raw payload, sender or tenant content is returned.
create function public.get_adapter_queue_health_v2()
returns table (
  pending_count bigint, processing_count bigint, retrying_count bigint,
  failed_count bigint, oldest_pending_at timestamptz,
  oldest_failed_at timestamptz, last_succeeded_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select count(*) filter (where job.status = 'pending'),
         count(*) filter (where job.status = 'processing'),
         count(*) filter (where job.status = 'pending' and job.attempt_count > 0),
         count(*) filter (where job.status = 'failed'),
         min(job.created_at) filter (where job.status = 'pending'),
         min(job.updated_at) filter (where job.status = 'failed'),
         max(job.completed_at) filter (where job.status = 'succeeded')
    from public.processing_jobs job
    join public.integration_webhook_events event
      on event.organization_id = job.organization_id
     and event.id = job.integration_event_id
    join public.integration_accounts account
      on account.organization_id = event.organization_id
     and account.id = event.integration_account_id
   where account.provider = 'event_adapter';
$$;
revoke execute on function public.get_adapter_queue_health_v2()
  from public, anon, authenticated;
grant execute on function public.get_adapter_queue_health_v2() to service_role;

create function public.prune_adapter_nonces()
returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  delete from public.integration_adapter_nonces
   where created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.prune_adapter_nonces()
  from public, anon, authenticated;
grant execute on function public.prune_adapter_nonces() to service_role;
