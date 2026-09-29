-- Correct the shared default to the existing AI course, preserving all lessons.
begin;
set local lock_timeout = '5s';
do $$
declare target uuid; obsolete record;
begin
  select id into target from public.master_course_groups
  where public.tenant_shared_owner(owner_admin_id)
    and lower(regexp_replace(name, '\s', '', 'g')) = 'ai활용기본과정'
  order by (owner_admin_id is null) desc, created_at, id limit 1;
  if target is null then
    insert into public.master_course_groups(name, sort_order)
      values ('AI 활용 기본 과정', 1) returning id into target;
  end if;
  update public.master_course_groups set is_default = false
    where public.tenant_shared_owner(owner_admin_id) and is_default;
  update public.master_course_groups set is_default = true where id = target;
  for obsolete in select id from public.master_course_groups
    where id <> target and public.tenant_shared_owner(owner_admin_id)
      and lower(regexp_replace(name, '\s', '', 'g')) = 'ai활용기본강좌' loop
    update public.master_courses set group_id = target where group_id = obsolete.id;
    delete from public.master_course_groups where id = obsolete.id;
  end loop;
end $$;

create or replace function public.ensure_my_course_group() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.is_admin() or public.admin_view_owner() is not null then raise exception 'forbidden'; end if;
  if public.tenant_global() then
    select id into v from public.master_course_groups
      where public.tenant_shared_owner(owner_admin_id)
      order by (lower(regexp_replace(name, '\s', '', 'g')) = 'ai활용기본과정') desc, is_default desc, sort_order, created_at limit 1;
    return v;
  end if;
  insert into public.master_course_groups (name, is_default, owner_admin_id)
    values ('내 강좌', true, auth.uid()) on conflict do nothing;
  select id into v from public.master_course_groups where owner_admin_id = auth.uid() and is_default;
  return v;
end $$;

-- Nonempty groups are already protected by course foreign keys (ON DELETE RESTRICT).
-- Protect default groups for direct API calls as well as the administration UI.
create function private.protect_default_course_group() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_default then
    -- Allow cleanup through an owning cohort's ON DELETE CASCADE.
    if tg_table_name = 'cohort_course_groups' then
      if not exists (select 1 from public.cohorts where id = old.cohort_id) then return old; end if;
    end if;
    raise exception 'Default course groups cannot be deleted' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger protect_default_master_group before delete on public.master_course_groups
  for each row execute function private.protect_default_course_group();
create trigger protect_default_cohort_group before delete on public.cohort_course_groups
  for each row execute function private.protect_default_course_group();
notify pgrst, 'reload schema';
commit;
