-- 비공개/타 기수 콘텐츠 차단 시 기존 RPC의 { ok: false } 응답 계약을 유지한다.

create or replace function public.rate_course(p_course_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_active_user()) then raise exception 'account inactive'; end if;
  if not exists (
    select 1
    from public.cohort_courses as course
    join public.cohort_course_groups as grp on grp.id = course.group_id
    where course.id = p_course_id
      and course.cohort_id = (select public.my_cohort_id())
      and grp.is_published
  ) then
    return jsonb_build_object('ok', false, 'error', 'course_unavailable');
  end if;
  return public.rate_course_active_impl(p_course_id, p_rating);
end $$;

create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_active_user()) then raise exception 'account inactive'; end if;
  if not exists (
    select 1
    from public.quizzes as quiz
    join public.cohort_courses as course on course.id = quiz.cohort_course_id
    join public.cohort_course_groups as grp on grp.id = course.group_id
    where quiz.id = p_quiz_id
      and course.cohort_id = (select public.my_cohort_id())
      and grp.is_published
  ) then
    return jsonb_build_object('ok', false, 'error', 'quiz_unavailable');
  end if;
  return public.submit_quiz_active_impl(p_quiz_id, p_answers);
end $$;

create or replace function public.submit_survey(p_survey_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_active_user()) then raise exception 'account inactive'; end if;
  if not exists (
    select 1
    from public.surveys as survey
    join public.cohort_courses as course on course.id = survey.cohort_course_id
    join public.cohort_course_groups as grp on grp.id = course.group_id
    where survey.id = p_survey_id
      and course.cohort_id = (select public.my_cohort_id())
      and grp.is_published
  ) then
    return jsonb_build_object('ok', false, 'error', 'survey_unavailable');
  end if;
  return public.submit_survey_active_impl(p_survey_id, p_answers);
end $$;

