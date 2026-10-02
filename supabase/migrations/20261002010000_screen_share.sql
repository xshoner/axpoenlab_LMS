begin;

create table public.screen_share_sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  teacher_id uuid not null references public.profiles(id),
  client_id uuid not null,
  state text not null default 'starting' check (state in ('starting','live','stopping','ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  lease_until timestamptz not null default now() + interval '45 seconds',
  token_until timestamptz not null default now(),
  sampled_at timestamptz not null default now(),
  participant_count integer not null default 0 check (participant_count >= 0)
);
create unique index screen_share_single_room on public.screen_share_sessions ((true)) where state <> 'ended';
create index screen_share_cohort_state on public.screen_share_sessions(cohort_id,state);
create table public.screen_share_usage (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.screen_share_sessions(id),
  from_at timestamptz not null,
  to_at timestamptz not null,
  participants integer not null check (participants >= 0),
  check (to_at >= from_at)
);
alter table public.screen_share_sessions enable row level security;
alter table public.screen_share_usage enable row level security;
revoke all on public.screen_share_sessions, public.screen_share_usage from anon, authenticated;
grant select on public.screen_share_sessions to authenticated;
grant all on public.screen_share_sessions, public.screen_share_usage to service_role;
grant usage, select on sequence public.screen_share_usage_id_seq to service_role;
create policy screen_share_read on public.screen_share_sessions for select to authenticated
using (public.is_active_user() and (
  (public.is_super_admin() and coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-admin-view' is null)
  or (exists (
    select 1 from public.cohort_members m join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.cohort_id = screen_share_sessions.cohort_id and p.role = 'student'
  ))
));

-- All mutations are service-role only; caller authorization lives in the Edge handler.
create function public.screen_share_claim(p_teacher uuid, p_cohort uuid, p_client uuid)
returns public.screen_share_sessions language plpgsql security definer set search_path = public as $$
declare s public.screen_share_sessions;
begin
  perform pg_advisory_xact_lock(6100201);
  insert into public.screen_share_usage(session_id,from_at,to_at,participants)
    select id,sampled_at,lease_until,participant_count from public.screen_share_sessions
    where state <> 'ended' and lease_until <= now() and sampled_at < lease_until and participant_count > 0;
  update public.screen_share_sessions set state='ended', ended_at=least(now(),lease_until)
    where state <> 'ended' and lease_until <= now();
  if exists(select 1 from public.screen_share_sessions where state <> 'ended') then
    raise exception 'screen_share_busy';
  end if;
  -- Old signed tokens cannot enter the next cohort's session in the reused room.
  if exists(select 1 from public.screen_share_sessions where token_until > now()) then
    raise exception 'screen_share_cooling_down';
  end if;
  insert into public.screen_share_sessions(teacher_id,cohort_id,client_id)
    values(p_teacher,p_cohort,p_client) returning * into s;
  return s;
end $$;

create function public.screen_share_sample(p_session uuid, p_count integer)
returns void language plpgsql security definer set search_path = public as $$
declare s public.screen_share_sessions; stop_at timestamptz;
begin
  select * into s from public.screen_share_sessions where id=p_session for update;
  if s.id is null then return; end if;
  stop_at := greatest(s.sampled_at,least(now(),s.lease_until));
  if s.participant_count > 0 and stop_at > s.sampled_at then
    insert into public.screen_share_usage(session_id,from_at,to_at,participants)
      values(s.id,s.sampled_at,stop_at,s.participant_count);
  end if;
  update public.screen_share_sessions set sampled_at=now(),participant_count=greatest(0,p_count)
    where id=s.id;
end $$;

create function public.screen_share_reserve_token(p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.screen_share_sessions set token_until=greatest(token_until,now()+interval '35 seconds')
    where id=p_session and state in ('starting','live') and lease_until > now();
  return found;
end $$;

create function public.screen_share_monthly_usage()
returns numeric language plpgsql security definer set search_path = public as $$
declare month_start timestamptz; result numeric;
begin
  if not public.is_active_user() or not public.is_super_admin()
    or coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-admin-view' is not null
    then raise exception 'forbidden'; end if;
  month_start := date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(sum(extract(epoch from (least(u.to_at,now())-greatest(u.from_at,month_start)))*u.participants/60),0)
    into result from public.screen_share_usage u where u.to_at > month_start and u.from_at < now();
  return round(result,1);
end $$;
revoke all on function public.screen_share_claim(uuid,uuid,uuid), public.screen_share_sample(uuid,integer),
  public.screen_share_reserve_token(uuid) from public, anon, authenticated;
grant execute on function public.screen_share_claim(uuid,uuid,uuid), public.screen_share_sample(uuid,integer),
  public.screen_share_reserve_token(uuid) to service_role;
revoke all on function public.screen_share_monthly_usage() from public, anon;
grant execute on function public.screen_share_monthly_usage() to authenticated;
alter publication supabase_realtime add table public.screen_share_sessions;

commit;
