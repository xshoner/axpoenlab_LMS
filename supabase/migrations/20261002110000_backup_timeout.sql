begin;
-- Only the service-role backup RPC needs a longer timeout for embedded lesson images.
create or replace function public.lms_backup_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare query text; tables jsonb;
begin
  select string_agg(format('select %L as name,(select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t) as rows',schemaname||'.'||tablename,schemaname,tablename),' union all ' order by schemaname,tablename)
  into query from pg_tables where schemaname='public'
    or (schemaname='auth' and tablename in('users','identities','mfa_factors'))
    or (schemaname='storage' and tablename in('buckets','objects'));
  execute 'select jsonb_object_agg(name,rows) from ('||query||')t' into tables;
  return jsonb_build_object('version',1,'created_at',now(),'tables',tables);
end $$;
alter function public.lms_backup_snapshot() set statement_timeout='120s';
notify pgrst,'reload schema';
commit;
