-- CLEAN-021: a manager may record the disposition of a source-backed review prompt.
-- Prompt calculations stay derived from the owning finance/operational records.
create table public.finance_exception_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  period_start date not null,
  rule_id text not null check (rule_id in
    ('stale-close-v1','unmatched-cost-v1','pending-intake-v1','supply-spike-v1',
     'repeat-repair-v1','revenue-variance-v1','time-exception-v1')),
  source_type text not null check (source_type in
    ('site','expense_claim','equipment_asset','finance_intake_item','time_entry')),
  source_id uuid not null,
  state text not null check (state in ('open','snoozed','resolved')),
  note text not null default '' check (length(note) <= 1000),
  owner_user_id uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,site_id,period_start,rule_id,source_type,source_id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  check (period_start=date_trunc('month',period_start)::date)
);
create index finance_exception_reviews_site_period on public.finance_exception_reviews
  (organization_id,site_id,period_start,state);

create table public.finance_exception_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  review_id uuid not null,
  previous_state text,
  state text not null check (state in ('open','snoozed','resolved')),
  note text not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,review_id)
    references public.finance_exception_reviews(organization_id,id) on delete cascade,
  foreign key (organization_id,site_id) references public.sites(organization_id,id)
);
create index finance_exception_review_events_review on public.finance_exception_review_events
  (organization_id,review_id,created_at);

alter table public.finance_exception_reviews enable row level security;
alter table public.finance_exception_review_events enable row level security;
revoke all on public.finance_exception_reviews,public.finance_exception_review_events
  from public,anon,authenticated;
grant select,insert,update on public.finance_exception_reviews to authenticated;
grant select on public.finance_exception_review_events to authenticated;
grant all on public.finance_exception_reviews,public.finance_exception_review_events to service_role;
create policy finance_exception_reviews_read on public.finance_exception_reviews
  for select to authenticated using (private.can_view_site_finance(organization_id,site_id));
create policy finance_exception_reviews_insert on public.finance_exception_reviews
  for insert to authenticated with check (private.can_view_site_finance(organization_id,site_id));
create policy finance_exception_reviews_update on public.finance_exception_reviews
  for update to authenticated using (private.can_view_site_finance(organization_id,site_id))
  with check (private.can_view_site_finance(organization_id,site_id));
create policy finance_exception_review_events_read on public.finance_exception_review_events
  for select to authenticated using (private.can_view_site_finance(organization_id,site_id));

create function private.audit_finance_exception_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid(); v_valid_source boolean := false;
begin
  if v_actor is null then raise exception 'Authenticated finance reviewer required'; end if;
  if tg_op='UPDATE' and (old.id,old.organization_id,old.site_id,old.period_start,old.rule_id,
      old.source_type,old.source_id) is distinct from
      (new.id,new.organization_id,new.site_id,new.period_start,new.rule_id,new.source_type,new.source_id)
    then raise exception 'Review source and scope are immutable';
  end if;
  if not private.can_view_site_finance(new.organization_id,new.site_id)
    then raise exception 'Finance site access required'; end if;
  case new.source_type
    when 'site' then v_valid_source := new.source_id=new.site_id;
    when 'expense_claim' then select exists(select 1 from public.expense_claims x
      where x.id=new.source_id and x.organization_id=new.organization_id
        and x.site_id=new.site_id) into v_valid_source;
    when 'equipment_asset' then select exists(select 1 from public.equipment_repair_cost_links x
      where x.asset_id=new.source_id and x.organization_id=new.organization_id
        and x.site_id=new.site_id) into v_valid_source;
    when 'finance_intake_item' then select exists(select 1 from public.finance_intake_items x
      where x.id=new.source_id and x.organization_id=new.organization_id
        and x.site_id=new.site_id) into v_valid_source;
    when 'time_entry' then select exists(select 1 from public.time_entries x
      where x.id=new.source_id and x.organization_id=new.organization_id
        and x.site_id=new.site_id) into v_valid_source;
  end case;
  if not v_valid_source then raise exception 'Review source is not at the selected finance site'; end if;
  new.owner_user_id := v_actor;
  new.updated_by := v_actor;
  new.updated_at := now();
  if tg_op='INSERT' then new.created_at := now(); end if;
  if tg_op='UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger finance_exception_review_stamp before insert or update on public.finance_exception_reviews
  for each row execute function private.audit_finance_exception_review();
revoke all on function private.audit_finance_exception_review() from public,anon,authenticated;

create function private.append_finance_exception_review_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.finance_exception_review_events
      (organization_id,site_id,review_id,previous_state,state,note,actor_user_id)
    values(new.organization_id,new.site_id,new.id,null,new.state,new.note,new.updated_by);
  elsif (old.state,old.note,old.owner_user_id) is distinct from
      (new.state,new.note,new.owner_user_id) then
    insert into public.finance_exception_review_events
      (organization_id,site_id,review_id,previous_state,state,note,actor_user_id)
    values(new.organization_id,new.site_id,new.id,old.state,new.state,new.note,new.updated_by);
  end if;
  return new;
end $$;
create trigger finance_exception_review_history after insert or update on public.finance_exception_reviews
  for each row execute function private.append_finance_exception_review_event();
revoke all on function private.append_finance_exception_review_event() from public,anon,authenticated;
