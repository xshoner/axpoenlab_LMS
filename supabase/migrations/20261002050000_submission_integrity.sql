begin;
-- All quiz writes go through the existing authenticated, transactional RPCs.
revoke insert,update,delete on public.quiz_submissions,public.quiz_answers from anon,authenticated;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,name,org,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',''),coalesce(new.raw_user_meta_data->>'org',''),'student')
  on conflict(id) do nothing;
  return new;
end $$;
create table public.submission_versions(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_course_id uuid not null references public.cohort_courses(id) on delete cascade,
  type text not null,file_path text,original_filename text,file_size bigint,url text,
  submitted_at timestamptz not null
);
create index on public.submission_versions(submission_id,submitted_at desc);
alter table public.submission_versions enable row level security;
revoke all on public.submission_versions from anon,authenticated;
grant select on public.submission_versions to authenticated;
grant all on public.submission_versions to service_role;
create policy submission_version_read on public.submission_versions for select to authenticated using(
  (select public.is_active_user()) and (user_id=(select auth.uid()) or
    ((select public.is_admin()) and cohort_course_id in(select private.tenant_readable_courses())))
);
insert into public.submission_versions(submission_id,user_id,cohort_course_id,type,file_path,original_filename,file_size,url,submitted_at)
select id,user_id,cohort_course_id,type,file_path,original_filename,file_size,url,submitted_at from public.submissions;
create function private.guard_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
declare extensions jsonb; max_mb numeric;
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id<>auth.uid() or not exists(
      select 1 from public.cohort_courses c join public.cohort_course_groups g on g.id=c.group_id
      where c.id=new.cohort_course_id and c.cohort_id=public.my_cohort_id() and c.assignment_enabled and g.is_published
    ) then raise exception 'assignment_not_available'; end if;
    if tg_op='UPDATE' and (new.user_id<>old.user_id or new.cohort_course_id<>old.cohort_course_id) then
      raise exception 'assignment_identity_immutable';
    end if;
    if new.type='url' and coalesce(new.url,'') !~ '^https?://[^[:space:]]+$' then raise exception 'invalid_assignment_url'; end if;
    if new.type='file' then
      select value into extensions from public.system_settings where key='allowed_extensions';
      select (value::text)::numeric into max_mb from public.system_settings where key='max_file_size_mb';
      if coalesce(new.file_path,'') not like new.user_id::text||'/'||new.cohort_course_id::text||'/%'
        or new.file_size is null or new.file_size<0 or new.file_size>coalesce(max_mb,5)*1048576
        or not coalesce(extensions,'["pdf","docx","pptx","xlsx","hwp","hwpx","zip","ipynb","py","txt","png","jpg"]'::jsonb)
          ? lower(substring(coalesce(new.original_filename,'') from '\.([^.]*)$'))
      then raise exception 'invalid_assignment_file'; end if;
    end if;
    new.submitted_at:=now();
  end if;
  return new;
end $$;
create trigger guard_assignment before insert or update on public.submissions for each row execute function private.guard_assignment();
create function private.version_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (new.type,new.file_path,new.url,new.submitted_at) is distinct from (old.type,old.file_path,old.url,old.submitted_at) then
    insert into public.submission_versions(submission_id,user_id,cohort_course_id,type,file_path,original_filename,file_size,url,submitted_at)
    values(new.id,new.user_id,new.cohort_course_id,new.type,new.file_path,new.original_filename,new.file_size,new.url,new.submitted_at);
  end if;
  return new;
end $$;
create trigger version_assignment after insert or update on public.submissions for each row execute function private.version_assignment();
revoke all on function private.guard_assignment(),private.version_assignment() from public,anon,authenticated;
commit;
