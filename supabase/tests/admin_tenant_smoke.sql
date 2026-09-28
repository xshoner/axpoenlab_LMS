-- Production-safe transaction: all fixtures and mutations are rolled back.
begin;
set local statement_timeout = '60s';
create temp table tenant_test_ids as select gen_random_uuid() a, gen_random_uuid() b,
  gen_random_uuid() student, gen_random_uuid() ca, gen_random_uuid() cb,
  gen_random_uuid() master, null::uuid copied,
  (select id from public.profiles where role='super_admin' and status='active' limit 1) super;
grant all on tenant_test_ids to authenticated;
insert into auth.users(id,email)
select a,a::text||'@tenant-test.invalid' from tenant_test_ids union all
select b,b::text||'@tenant-test.invalid' from tenant_test_ids union all
select student,student::text||'@tenant-test.invalid' from tenant_test_ids;
update public.profiles set role='admin' where id in (select a from tenant_test_ids union all select b from tenant_test_ids);
insert into public.master_courses(id,group_id,title,body)
select master,(select id from public.master_course_groups where is_default and owner_admin_id is null),
  'Transaction-only tenant test','original' from tenant_test_ids;

select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true),set_config('request.headers','{}',true) from tenant_test_ids;
set local role authenticated;
insert into public.cohorts(id,name,code) select ca,'Transaction-only A',upper(ca::text) from tenant_test_ids;
do $$ begin
  if (select count(*) from public.cohorts) <> 1 then raise exception 'admin A sees legacy cohorts'; end if;
  if exists(select 1 from public.profiles where role='student') then raise exception 'admin A sees unrelated members'; end if;
end $$;
update tenant_test_ids set copied=public.copy_master_to_my_courses(master);
update public.master_courses set body='edited copy' where id=(select copied from tenant_test_ids);
do $$ declare n int; begin
  update public.master_courses set body='forbidden' where id=(select master from tenant_test_ids);
  get diagnostics n=row_count;
  if n <> 0 then raise exception 'master edit allowed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true) from tenant_test_ids;
set local role authenticated;
insert into public.cohorts(id,name,code) select cb,'Transaction-only B',upper(cb::text) from tenant_test_ids;
do $$ begin
  if (select count(*) from public.cohorts) <> 1 then raise exception 'admin B sees other cohorts'; end if;
  if exists(select 1 from public.master_courses where id=(select copied from tenant_test_ids)) then raise exception 'admin B sees private course'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated')::text,true) from tenant_test_ids;
set local role authenticated;
select public.join_cohort_by_code(ca::text) from tenant_test_ids;
do $$ begin
  if jsonb_array_length(public.student_dashboard()->'courses') <> 0 then raise exception 'student dashboard leaks unrelated courses'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true) from tenant_test_ids;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.profiles where id=(select student from tenant_test_ids)) then raise exception 'invited student missing'; end if;
  if (select count(*) from public.profiles where role='student') <> 1 then raise exception 'unrelated member visible'; end if;
  if (public.admin_dashboard_overview()->>'totalStudents')::int <> 1 then raise exception 'admin dashboard member scope'; end if;
  if exists(select 1 from public.master_library_group_list() where owner_admin_id=(select a from tenant_test_ids)) then raise exception 'personal admin group exposed as master'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',super,'role','authenticated')::text,true),
  set_config('request.headers',jsonb_build_object('x-admin-view',a)::text,true) from tenant_test_ids;
set local role authenticated;
do $$ declare n int; begin
  if (select count(*) from public.cohorts) <> 1 then raise exception 'super preview not scoped'; end if;
  if (public.admin_dashboard_overview()->>'totalStudents')::int <> 1 then raise exception 'preview dashboard not scoped'; end if;
  update public.cohorts set name='forbidden' where id=(select ca from tenant_test_ids);
  get diagnostics n=row_count;
  if n <> 0 then raise exception 'super preview write allowed'; end if;
end $$;
reset role;
select set_config('request.headers','{}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.cohorts where id in (select ca from tenant_test_ids union all select cb from tenant_test_ids)) <> 2 then raise exception 'super global visibility broken'; end if;
end $$;
reset role;
select 'PASS: production roles, membership, master copy, isolation and read-only preview; fixtures rolled back' result;
rollback;
