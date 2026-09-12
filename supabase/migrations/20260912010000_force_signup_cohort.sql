-- 관리자가 선택한 단 하나의 기수 코드를 모든 신규 회원가입에 강제한다.
alter table public.cohorts
  add column if not exists signup_forced boolean not null default false;

create unique index if not exists cohorts_one_forced_signup_idx
  on public.cohorts (signup_forced)
  where signup_forced and deleted_at is null;

create or replace function public.get_forced_signup_cohort()
returns table (name text, code text)
language sql
stable
security definer
set search_path = ''
as $$
  select cohort.name, cohort.code
  from public.cohorts as cohort
  where cohort.signup_forced and cohort.deleted_at is null
  limit 1
$$;

revoke all on function public.get_forced_signup_cohort() from public;
grant execute on function public.get_forced_signup_cohort() to anon, authenticated;

create or replace function public.set_forced_signup_cohort(p_cohort_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;

  update public.cohorts set signup_forced = false where signup_forced;
  if p_enabled then
    update public.cohorts
      set signup_forced = true
      where id = p_cohort_id and deleted_at is null;
    if not found then raise exception 'cohort not found'; end if;
  end if;
end
$$;

revoke all on function public.set_forced_signup_cohort(uuid, boolean) from public, anon;
grant execute on function public.set_forced_signup_cohort(uuid, boolean) to authenticated;

-- 강제 설정 중에는 조작된 클라이언트 코드 대신 서버의 현재 강제 코드를 사용한다.
create or replace function public.join_cohort_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  select cohort.code into v_code
  from public.cohorts as cohort
  where cohort.signup_forced and cohort.deleted_at is null
  limit 1;
  return public.join_cohort_by_code_active_impl(coalesce(v_code, p_code));
end
$$;

revoke all on function public.join_cohort_by_code(text) from public, anon;
grant execute on function public.join_cohort_by_code(text) to authenticated;
