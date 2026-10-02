begin;
create table public.backup_runs(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),checksum text not null,bytes bigint not null,table_count integer not null,file_count integer not null);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from public,anon,authenticated;
grant select on public.backup_runs to authenticated;
grant all on public.backup_runs to service_role;
create policy backup_run_read on public.backup_runs for select to authenticated using ((select public.tenant_global()));
create function public.lms_backup_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t record; data jsonb; tables jsonb:='{}'::jsonb;
begin
  -- A single stable statement snapshot; no user-supplied schema/table names.
  for t in select schemaname,tablename from pg_tables where schemaname='public'
    or (schemaname='auth' and tablename in('users','identities','mfa_factors'))
    or (schemaname='storage' and tablename in('buckets','objects')) order by schemaname,tablename loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',t.schemaname,t.tablename) into data;
    tables:=tables||jsonb_build_object(t.schemaname||'.'||t.tablename,data);
  end loop;
  return jsonb_build_object('version',1,'created_at',now(),'tables',tables);
end $$;
create function public.record_backup(p_checksum text,p_bytes bigint,p_tables integer,p_files integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_checksum !~ '^[a-f0-9]{64}$' or p_bytes<=0 then raise exception 'invalid_backup'; end if;
  insert into public.backup_runs(checksum,bytes,table_count,file_count) values(p_checksum,p_bytes,p_tables,p_files);
end $$;
revoke all on function public.lms_backup_snapshot(),public.record_backup(text,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.lms_backup_snapshot(),public.record_backup(text,bigint,integer,integer) to service_role;
commit;
