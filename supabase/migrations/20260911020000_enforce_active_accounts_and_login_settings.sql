-- 비활성 계정을 UI 표시가 아닌 실제 접근 차단 상태로 만든다.
-- 데이터 행은 변경하지 않으며, 인증/권한 함수와 RLS 정책만 강화한다.

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  ), false)
$$;

create or replace function public.current_role_of() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles
  where id = auth.uid() and status = 'active'
$$;

create or replace function public.my_cohort_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select member.cohort_id
  from public.cohort_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.user_id = auth.uid() and profile.status = 'active'
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to anon, authenticated;

-- 기존 정책의 조건을 보존하면서 활성 계정 조건을 앞에 추가한다.
-- 비활성 사용자도 자신의 상태를 확인할 수 있도록 own profile select만 제외한다.
-- 공개 이미지 읽기는 로그인과 무관한 기존 동작을 유지한다.
do $$
declare
  policy_row record;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and not (schemaname = 'public' and tablename = 'profiles' and policyname = 'own profile select')
      and not (schemaname = 'storage' and tablename = 'objects' and policyname = 'course images read')
  loop
    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename
    );
    if policy_row.qual is not null then
      statement := statement || format(
        ' using (public.is_active_user() and (%s))', policy_row.qual
      );
    end if;
    if policy_row.with_check is not null then
      statement := statement || format(
        ' with check (public.is_active_user() and (%s))', policy_row.with_check
      );
    end if;
    execute statement;
  end loop;
end $$;

-- 로그인 전에는 비민감 설정 2개만 읽을 수 있다.
create policy "public login security settings read"
on public.system_settings for select to anon
using (key in ('login_lock_attempts', 'login_lock_minutes'));

-- SECURITY DEFINER 학생 RPC는 RLS를 우회하므로 구현을 비공개 이름으로 보관하고
-- 활성 상태를 확인하는 동일 시그니처 래퍼를 앞에 둔다.
alter function public.record_visit() rename to record_visit_active_impl;
alter function public.visit_stats() rename to visit_stats_active_impl;
alter function public.join_cohort_by_code(text) rename to join_cohort_by_code_active_impl;
alter function public.record_course_view(uuid) rename to record_course_view_active_impl;
alter function public.increment_notice_view(uuid) rename to increment_notice_view_active_impl;
alter function public.rate_course(uuid, int) rename to rate_course_active_impl;
alter function public.submit_quiz(uuid, jsonb) rename to submit_quiz_active_impl;
alter function public.submit_survey(uuid, jsonb) rename to submit_survey_active_impl;
alter function public.rate_hackathon(uuid, int) rename to rate_hackathon_active_impl;
alter function public.my_help_position() rename to my_help_position_active_impl;

revoke all on function public.record_visit_active_impl() from public, anon, authenticated;
revoke all on function public.visit_stats_active_impl() from public, anon, authenticated;
revoke all on function public.join_cohort_by_code_active_impl(text) from public, anon, authenticated;
revoke all on function public.record_course_view_active_impl(uuid) from public, anon, authenticated;
revoke all on function public.increment_notice_view_active_impl(uuid) from public, anon, authenticated;
revoke all on function public.rate_course_active_impl(uuid, int) from public, anon, authenticated;
revoke all on function public.submit_quiz_active_impl(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_survey_active_impl(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.rate_hackathon_active_impl(uuid, int) from public, anon, authenticated;
revoke all on function public.my_help_position_active_impl() from public, anon, authenticated;

create function public.record_visit() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.record_visit_active_impl();
end $$;

create function public.visit_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.visit_stats_active_impl();
end $$;

create function public.join_cohort_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.join_cohort_by_code_active_impl(p_code);
end $$;

create function public.record_course_view(p_course_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  perform public.record_course_view_active_impl(p_course_id);
end $$;

create function public.increment_notice_view(p_notice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  perform public.increment_notice_view_active_impl(p_notice_id);
end $$;

create function public.rate_course(p_course_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.rate_course_active_impl(p_course_id, p_rating);
end $$;

create function public.submit_quiz(p_quiz_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.submit_quiz_active_impl(p_quiz_id, p_answers);
end $$;

create function public.submit_survey(p_survey_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.submit_survey_active_impl(p_survey_id, p_answers);
end $$;

create function public.rate_hackathon(p_entry_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.rate_hackathon_active_impl(p_entry_id, p_rating);
end $$;

create function public.my_help_position() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  return public.my_help_position_active_impl();
end $$;

revoke all on function public.record_visit() from public, anon;
revoke all on function public.visit_stats() from public, anon;
revoke all on function public.join_cohort_by_code(text) from public, anon;
revoke all on function public.record_course_view(uuid) from public, anon;
revoke all on function public.increment_notice_view(uuid) from public, anon;
revoke all on function public.rate_course(uuid, int) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb) from public, anon;
revoke all on function public.submit_survey(uuid, jsonb) from public, anon;
revoke all on function public.rate_hackathon(uuid, int) from public, anon;
revoke all on function public.my_help_position() from public, anon;

grant execute on function public.record_visit() to authenticated;
grant execute on function public.visit_stats() to authenticated;
grant execute on function public.join_cohort_by_code(text) to authenticated;
grant execute on function public.record_course_view(uuid) to authenticated;
grant execute on function public.increment_notice_view(uuid) to authenticated;
grant execute on function public.rate_course(uuid, int) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;
grant execute on function public.submit_survey(uuid, jsonb) to authenticated;
grant execute on function public.rate_hackathon(uuid, int) to authenticated;
grant execute on function public.my_help_position() to authenticated;
