begin;
create table public.operation_events(id bigint generated always as identity primary key,actor_id uuid,action text not null,target_type text not null,target_id text,created_at timestamptz not null default now());
create index on public.operation_events(created_at desc);
create table public.client_errors(id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id) on delete cascade,category text not null,code text not null,created_at timestamptz not null default now());
create index on public.client_errors(user_id,created_at desc);
alter table public.operation_events enable row level security;
alter table public.client_errors enable row level security;
revoke all on public.operation_events,public.client_errors from anon,authenticated;
grant select on public.operation_events,public.client_errors to authenticated;
grant all on public.operation_events,public.client_errors to service_role;
grant usage,select on sequence public.operation_events_id_seq,public.client_errors_id_seq to service_role;
create policy operations_read on public.operation_events for select to authenticated using ((select public.tenant_global()));
create policy errors_read on public.client_errors for select to authenticated using ((select public.tenant_global()));
create function public.record_client_error(p_category text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_active_user() then return; end if;
  if p_category not in ('render','load','network','share','unexpected') or p_code !~ '^[A-Z0-9_-]{1,40}$' then return; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if (select count(*) from public.client_errors where user_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then return; end if;
  insert into public.client_errors(user_id,category,code) values(auth.uid(),p_category,p_code);
end $$;
create function private.audit_operation() returns trigger
language plpgsql security definer set search_path='' as $$
declare target text; action text;
begin
  if tg_table_name='system_settings' then target:=case when tg_op='DELETE' then old.key else new.key end;
  else target:=case when tg_op='DELETE' then old.id::text else new.id::text end; end if;
  if tg_table_name='profiles' then
    if tg_op='UPDATE' and (new.role,new.status) is not distinct from (old.role,old.status) then return new; end if;
  end if;
  if tg_table_name='screen_share_sessions' then
    if tg_op='UPDATE' and new.state=old.state then return new; end if;
  end if;
  if tg_table_name='quiz_submissions' then
    if not new.graded or (tg_op='UPDATE' and new.graded=old.graded and new.total_score is not distinct from old.total_score) then return new; end if;
  end if;
  action:=lower(tg_op);
  if tg_table_name='screen_share_sessions' then action:=new.state; end if;
  if tg_table_name='quiz_submissions' then action:='graded'; end if;
  insert into public.operation_events(actor_id,action,target_type,target_id)
  values(auth.uid(),action,tg_table_name,target);
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger audit_profile after update or delete on public.profiles for each row execute function private.audit_operation();
create trigger audit_membership after insert or update or delete on public.cohort_members for each row execute function private.audit_operation();
create trigger audit_master_delete after delete on public.master_courses for each row execute function private.audit_operation();
create trigger audit_course_delete after delete on public.cohort_courses for each row execute function private.audit_operation();
create trigger audit_cohort after insert or update or delete on public.cohorts for each row execute function private.audit_operation();
create trigger audit_grade after update on public.quiz_submissions for each row execute function private.audit_operation();
create trigger audit_share after insert or update on public.screen_share_sessions for each row execute function private.audit_operation();
create trigger audit_setting after insert or update or delete on public.system_settings for each row execute function private.audit_operation();
create function public.operations_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cron_runs jsonb:='[]'::jsonb;
begin
  if not public.tenant_global() then raise exception 'forbidden'; end if;
  if to_regclass('cron.job_run_details') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select jobid,status,start_time,end_time from cron.job_run_details order by start_time desc limit 20)t' into cron_runs;
  end if;
  return jsonb_build_object('errors24h',(select count(*) from public.client_errors where created_at>now()-interval '1 day'),
    'errors',coalesce((select jsonb_agg(t) from(select category,code,count(*) as count,max(created_at) as last_at from public.client_errors where created_at>now()-interval '7 days' group by category,code order by max(created_at) desc limit 20)t),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(t) from(select * from public.operation_events order by created_at desc limit 50)t),'[]'::jsonb),
    'activeShares',(select count(*) from public.screen_share_sessions where state<>'ended'),
    'monthlyMinutes',public.screen_share_monthly_usage(),'cron',cron_runs,
    'backup',(select to_jsonb(b) from public.backup_runs b order by created_at desc limit 1),
    'files',(select count(*) from storage.objects),
    'integrityProtected',not has_column_privilege('authenticated','public.quiz_submissions','total_score','INSERT'));
end $$;
revoke all on function public.operations_status(),public.record_client_error(text,text),private.audit_operation() from public,anon;
revoke all on function private.audit_operation() from authenticated;
grant execute on function public.operations_status(),public.record_client_error(text,text) to authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $cmd$select cron.schedule('lms-operation-retention','15 18 * * *','delete from public.client_errors where created_at<now()-interval ''90 days''; delete from public.operation_events where created_at<now()-interval ''365 days'';')$cmd$;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
