begin;
create table public.screen_share_receivers(
  session_id uuid not null references public.screen_share_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,client_id uuid not null,
  state text not null check(state in ('connecting','receiving','reconnecting','error','ended')),
  reported_at timestamptz not null default now(),primary key(session_id,user_id,client_id)
);
alter table public.screen_share_receivers enable row level security;
revoke all on public.screen_share_receivers from public,anon,authenticated;
grant all on public.screen_share_receivers to service_role;
create function public.screen_share_report(p_session uuid,p_client uuid,p_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_state not in ('connecting','receiving','reconnecting','error','ended') or p_client is null then return; end if;
  if not public.is_active_user() or public.current_role_of()<>'student' then return; end if;
  if not exists(select 1 from public.screen_share_sessions s join public.cohort_members m on m.cohort_id=s.cohort_id
    where s.id=p_session and m.user_id=auth.uid() and s.state='live' and s.lease_until>now()) then return; end if;
  insert into public.screen_share_receivers(session_id,user_id,client_id,state)
  values(p_session,auth.uid(),p_client,p_state) on conflict(session_id,user_id,client_id)
  do update set state=excluded.state,reported_at=now();
end $$;
create function public.screen_share_receiver_status(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.screen_share_sessions;
begin
  if not public.tenant_global() then raise exception 'forbidden'; end if;
  select * into s from public.screen_share_sessions where id=p_session;
  if s.id is null then return null; end if;
  return jsonb_build_object('session_id',s.id,'cohort_id',s.cohort_id,'state',s.state,'students',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'state',case when s.state<>'live' then 'ended' else coalesce(r.state,'waiting') end,'reported_at',r.reported_at) order by p.name,p.id)
    from public.cohort_members m join public.profiles p on p.id=m.user_id
    left join lateral(select state,reported_at from public.screen_share_receivers r where r.session_id=s.id and r.user_id=p.id
      and r.reported_at>now()-interval '40 seconds' order by case when state='receiving' then 0 else 1 end,reported_at desc limit 1)r on true
    where m.cohort_id=s.cohort_id and p.role='student' and p.status='active'),'[]'::jsonb));
end $$;
revoke all on function public.screen_share_report(uuid,uuid,text),public.screen_share_receiver_status(uuid) from public,anon;
grant execute on function public.screen_share_report(uuid,uuid,text),public.screen_share_receiver_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
