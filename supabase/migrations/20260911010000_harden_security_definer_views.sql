-- Security Advisor 0010 대응: public 스키마의 SECURITY DEFINER 뷰 4개를
-- SECURITY INVOKER 뷰로 교체한다.
--
-- 기존 뷰는 의도적으로 기초 테이블의 RLS를 우회한 뒤 뷰 내부에서 사용자를
-- 제한했다. security_invoker 옵션만 켜면 학생의 퀴즈 문항/별점 통계/운영진
-- 표시 조회가 중단되므로, 동일한 제한 로직을 API에 노출되지 않는 private
-- 스키마의 최소 컬럼 반환 함수로 옮긴다. 테이블 데이터는 변경하지 않는다.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.quiz_questions_student_rows()
returns table (
  id uuid,
  quiz_id uuid,
  order_no int,
  type text,
  text text,
  points numeric,
  options jsonb,
  answer jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    question.id,
    question.quiz_id,
    question.order_no,
    question.type,
    question.text,
    question.points,
    question.options,
    case when quiz.status = 'closed' and quiz.reveal_answers then question.answer else null end
  from public.quiz_questions as question
  join public.quizzes as quiz on quiz.id = question.quiz_id
  where auth.uid() is not null
    and quiz.status in ('open', 'closed')
    and (
      public.is_admin()
      or exists (
        select 1
        from public.cohort_members as member
        join public.cohort_courses as course on course.cohort_id = member.cohort_id
        where member.user_id = auth.uid()
          and course.id = quiz.cohort_course_id
      )
    )
$$;

create or replace function private.staff_directory_rows()
returns table (id uuid, name text, nickname text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.name, profile.nickname, profile.role
  from public.profiles as profile
  where auth.uid() is not null
    and profile.role in ('admin', 'super_admin')
$$;

create or replace function private.course_rating_stats_rows()
returns table (
  cohort_course_id uuid,
  cohort_id uuid,
  master_course_id uuid,
  rating_count int,
  avg_rating numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with aggregate_ratings as (
    select
      coalesce(course.master_course_id::text, course.id::text) as group_key,
      count(rating.id)::int as rating_count,
      round(avg(rating.rating)::numeric, 2) as avg_rating
    from public.cohort_courses as course
    join public.course_ratings as rating on rating.cohort_course_id = course.id
    group by 1
  )
  select
    course.id,
    course.cohort_id,
    course.master_course_id,
    aggregate_ratings.rating_count,
    aggregate_ratings.avg_rating
  from public.cohort_courses as course
  join aggregate_ratings
    on aggregate_ratings.group_key = coalesce(course.master_course_id::text, course.id::text)
  where auth.uid() is not null
    and (public.is_admin() or course.cohort_id = public.my_cohort_id())
$$;

create or replace function private.hackathon_rating_stats_rows()
returns table (entry_id uuid, cohort_id uuid, rating_count int, avg_rating numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    entry.id,
    entry.cohort_id,
    count(rating.id)::int,
    round(avg(rating.rating)::numeric, 2)
  from public.hackathon_entries as entry
  join public.hackathon_ratings as rating on rating.entry_id = entry.id
  where auth.uid() is not null
    and (public.is_admin() or entry.cohort_id = public.my_cohort_id())
  group by entry.id
$$;

revoke all on function private.quiz_questions_student_rows() from public, anon;
revoke all on function private.staff_directory_rows() from public, anon;
revoke all on function private.course_rating_stats_rows() from public, anon;
revoke all on function private.hackathon_rating_stats_rows() from public, anon;

grant execute on function private.quiz_questions_student_rows() to authenticated;
grant execute on function private.staff_directory_rows() to authenticated;
grant execute on function private.course_rating_stats_rows() to authenticated;
grant execute on function private.hackathon_rating_stats_rows() to authenticated;

create or replace view public.quiz_questions_student
with (security_barrier = true, security_invoker = true) as
select * from private.quiz_questions_student_rows();

create or replace view public.staff_directory
with (security_barrier = true, security_invoker = true) as
select * from private.staff_directory_rows();

create or replace view public.course_rating_stats
with (security_barrier = true, security_invoker = true) as
select * from private.course_rating_stats_rows();

create or replace view public.hackathon_rating_stats
with (security_barrier = true, security_invoker = true) as
select * from private.hackathon_rating_stats_rows();

grant select on public.quiz_questions_student to authenticated;
grant select on public.staff_directory to authenticated;
grant select on public.course_rating_stats to authenticated;
grant select on public.hackathon_rating_stats to authenticated;

revoke all on public.quiz_questions_student from anon;
revoke all on public.staff_directory from anon;
revoke all on public.course_rating_stats from anon;
revoke all on public.hackathon_rating_stats from anon;
