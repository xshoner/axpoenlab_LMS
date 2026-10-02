begin;
create table public.backup_snapshots(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),tables jsonb not null default '{}');
create table public.backup_snapshot_rows(snapshot_id uuid not null references public.backup_snapshots(id) on delete cascade,table_name text not null,row_no bigint not null,body jsonb not null,primary key(snapshot_id,table_name,row_no));
alter table public.backup_snapshots enable row level security;
alter table public.backup_snapshot_rows enable row level security;
revoke all on public.backup_snapshots,public.backup_snapshot_rows from public,anon,authenticated;
grant all on public.backup_snapshots,public.backup_snapshot_rows to service_role;
create function public.lms_backup_stage() returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='120s' set default_transaction_isolation='repeatable read' as $$
declare snapshot uuid; t record; rows bigint; manifest jsonb:='{}';
begin
  delete from public.backup_snapshots where created_at<now()-interval '1 day';
  insert into public.backup_snapshots default values returning id into snapshot;
  for t in select schemaname,tablename from pg_tables where (schemaname='public' and tablename not in ('backup_snapshots','backup_snapshot_rows'))
    or (schemaname='auth' and tablename in ('users','identities','mfa_factors'))
    or (schemaname='storage' and tablename in ('buckets','objects')) order by schemaname,tablename loop
    execute format('insert into public.backup_snapshot_rows select $1,%L,row_number() over(),to_jsonb(t) from %I.%I t',t.schemaname||'.'||t.tablename,t.schemaname,t.tablename) using snapshot;
    get diagnostics rows=row_count;
    manifest:=manifest||jsonb_build_object(t.schemaname||'.'||t.tablename,rows);
  end loop;
  update public.backup_snapshots set tables=manifest where id=snapshot;
  return jsonb_build_object('id',snapshot,'created_at',now(),'tables',manifest);
end $$;
create function public.lms_backup_chunk(p_snapshot uuid,p_table text,p_offset bigint default 0,p_size integer default 200) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(body order by row_no),'[]'::jsonb) from (
    select body,row_no from public.backup_snapshot_rows where snapshot_id=p_snapshot and table_name=p_table
    order by row_no offset greatest(p_offset,0) limit least(greatest(p_size,1),200)
  )t
$$;
-- Prevent another unbounded response from the earlier maintenance RPC.
revoke execute on function public.lms_backup_snapshot() from service_role;
revoke all on function public.lms_backup_stage(),public.lms_backup_chunk(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.lms_backup_stage(),public.lms_backup_chunk(uuid,text,bigint,integer) to service_role;
notify pgrst,'reload schema';
commit;
