begin;
set local lock_timeout = '5s';

-- Match the bounded cleanup duration; pg_net must not abandon a large-cohort stop at 30s.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('screen-share-watchdog','30 seconds',$job$
      select net.http_post(
        url := 'https://ugelgndotyppgksbubot.supabase.co/functions/v1/screen-share',
        headers := jsonb_build_object('Content-Type','application/json','x-screen-share-worker',
          (select decrypted_secret from vault.decrypted_secrets where name='screen_share_worker_key' limit 1)),
        body := '{"action":"sweep"}'::jsonb,
        timeout_milliseconds := 120000)
      where exists(select 1 from public.screen_share_sessions where state <> 'ended' and lease_until <= now())
        and exists(select 1 from vault.decrypted_secrets where name='screen_share_worker_key');
    $job$);
  end if;
end $$;

create or replace function public.operations_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cron_runs jsonb:='[]'::jsonb; watchdog boolean:=false; worker_secret boolean:=false;
begin
  if not public.tenant_global() then raise exception 'forbidden'; end if;
  if to_regclass('cron.job_run_details') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select jobid,status,start_time,end_time from cron.job_run_details order by start_time desc limit 20)t' into cron_runs;
  end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname=''screen-share-watchdog'' and active)' into watchdog;
  end if;
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select exists(select 1 from vault.decrypted_secrets where name=''screen_share_worker_key'' and length(decrypted_secret)>0)' into worker_secret;
  end if;
  return jsonb_build_object('errors24h',(select count(*) from public.client_errors where created_at>now()-interval '1 day'),
    'errors',coalesce((select jsonb_agg(t) from(select category,code,count(*) as count,max(created_at) as last_at from public.client_errors where created_at>now()-interval '7 days' group by category,code order by max(created_at) desc limit 20)t),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(t) from(select * from public.operation_events order by created_at desc limit 50)t),'[]'::jsonb),
    'activeShares',(select count(*) from public.screen_share_sessions where state<>'ended'),
    'stoppingShares',(select count(*) from public.screen_share_sessions where state='stopping'),
    'overdueShares',(select count(*) from public.screen_share_sessions where state<>'ended' and lease_until<=now()),
    'watchdogConfigured',watchdog and worker_secret,
    'monthlyMinutes',public.screen_share_monthly_usage(),'cron',cron_runs,
    'backup',(select to_jsonb(b) from public.backup_runs b order by created_at desc limit 1),
    'files',(select count(*) from storage.objects),
    'integrityProtected',not has_column_privilege('authenticated','public.quiz_submissions','total_score','INSERT'));
end $$;
notify pgrst,'reload schema';
commit;
