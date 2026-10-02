begin;

-- Keep the single-room lock until Daily ejection completes. Expired rows must
-- never be marked ended by a new start before the server clears the old meeting.
create or replace function public.screen_share_claim(p_teacher uuid, p_cohort uuid, p_client uuid)
returns public.screen_share_sessions language plpgsql security definer set search_path = public as $$
declare s public.screen_share_sessions;
begin
  perform pg_advisory_xact_lock(6100201);
  if exists(select 1 from public.screen_share_sessions where state <> 'ended') then raise exception 'screen_share_busy'; end if;
  if exists(select 1 from public.screen_share_sessions where token_until > now()) then raise exception 'screen_share_cooling_down'; end if;
  insert into public.screen_share_sessions(teacher_id,cohort_id,client_id)
    values(p_teacher,p_cohort,p_client) returning * into s;
  return s;
end $$;

create function public.screen_share_lock_stop(p_session uuid, p_expired boolean)
returns public.screen_share_sessions language plpgsql security definer set search_path = public as $$
declare s public.screen_share_sessions;
begin
  perform pg_advisory_xact_lock(6100201);
  select * into s from public.screen_share_sessions
    where state <> 'ended' and (p_session is null or id=p_session)
      and (not p_expired or lease_until <= now())
      and (state <> 'stopping' or lease_until <= now())
    for update;
  if s.id is null then return null; end if;
  perform public.screen_share_sample(s.id,0);
  -- One cleanup owns the room; retry only after its bounded REST calls finish.
  update public.screen_share_sessions set state='stopping',lease_until=now()+interval '120 seconds'
    where id=s.id returning * into s;
  return s;
end $$;
revoke all on function public.screen_share_lock_stop(uuid,boolean) from public,anon,authenticated;
grant execute on function public.screen_share_lock_stop(uuid,boolean) to service_role;

-- PGlite test databases do not provide these hosted Supabase extensions.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('screen-share-watchdog','30 seconds',$job$
      select net.http_post(
        url := 'https://ugelgndotyppgksbubot.supabase.co/functions/v1/screen-share',
        headers := jsonb_build_object('Content-Type','application/json','x-screen-share-worker',
          (select decrypted_secret from vault.decrypted_secrets where name='screen_share_worker_key' limit 1)),
        body := '{"action":"sweep"}'::jsonb,
        timeout_milliseconds := 30000)
      where exists(select 1 from public.screen_share_sessions where state <> 'ended' and lease_until <= now())
        and exists(select 1 from vault.decrypted_secrets where name='screen_share_worker_key');
    $job$);
  end if;
end $$;

commit;
