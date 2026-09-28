begin;
set local search_path = public, extensions;
select plan(5);

select ok(not has_function_privilege('anon',
  'public.get_adapter_queue_health_v2()', 'execute'),
  'anonymous caller cannot inspect adapter queue');
select ok(not has_function_privilege('authenticated',
  'public.get_adapter_queue_health_v2()', 'execute'),
  'browser role cannot inspect adapter queue');
select ok(not has_function_privilege('authenticated',
  'public.prune_adapter_nonces()', 'execute'),
  'browser role cannot prune adapter nonces');

set local role service_role;
select is((select count(*) from public.get_adapter_queue_health_v2()), 1::bigint,
  'service worker receives one bounded aggregate row');
select is((select public.prune_adapter_nonces()), 0,
  'service worker can prune expired nonces without disturbing current ones');
rollback;
