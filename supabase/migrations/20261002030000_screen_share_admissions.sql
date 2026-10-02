begin;
-- Record signed-token recipients before issuance. Daily's REST presence snapshot
-- can lag departures/arrivals, so ejection must also target every admitted user.
create table public.screen_share_admissions (
  session_id uuid not null references public.screen_share_sessions(id) on delete cascade,
  user_id uuid not null,
  primary key(session_id,user_id)
);
alter table public.screen_share_admissions enable row level security;
revoke all on public.screen_share_admissions from public,anon,authenticated;
grant all on public.screen_share_admissions to service_role;
commit;
