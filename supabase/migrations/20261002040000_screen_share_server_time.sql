begin;
-- Evaluate expiry with DB time, while retaining the caller's existing RLS.
-- Local PC clocks must not suppress a live lesson or prolong a billed connection.
create function public.screen_share_current(p_cohort uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'id',s.id,'cohort_id',s.cohort_id,'teacher_id',s.teacher_id,'state',s.state,
    'lease_until',s.lease_until,'started_at',s.started_at,
    'lease_remaining_ms',floor(extract(epoch from (s.lease_until-now()))*1000))
  from public.screen_share_sessions s
  where s.state in ('starting','live','stopping') and s.lease_until > now()
    and (p_cohort is null or (s.cohort_id=p_cohort and s.state='live'))
  order by s.created_at desc limit 1;
$$;
revoke all on function public.screen_share_current(uuid) from public,anon;
grant execute on function public.screen_share_current(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
