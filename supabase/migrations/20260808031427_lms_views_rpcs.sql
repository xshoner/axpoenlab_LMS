-- ============ 학생용 퀴즈 문항 뷰 (정답 차단, 마감+공개 시에만 노출) ============
create view public.quiz_questions_student
with (security_barrier = true, security_invoker = false) as
select
  q.id, q.quiz_id, q.order_no, q.type, q.text, q.points, q.options,
  case when z.status = 'closed' and z.reveal_answers then q.answer else null end as answer
from public.quiz_questions q
join public.quizzes z on z.id = q.quiz_id
where z.status in ('open','closed')
  and (
    public.is_admin()
    or exists (
      select 1 from public.cohort_members m
      join public.cohort_courses cc on cc.cohort_id = m.cohort_id
      where m.user_id = auth.uid() and cc.id = z.cohort_course_id
    )
  );
grant select on public.quiz_questions_student to authenticated;

-- ============ 방문 기록 + 통계 ============
create or replace function public.record_visit() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_today int; v_total int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.visit_logs (user_id, visited_date)
  values (auth.uid(), (now() at time zone 'Asia/Seoul')::date)
  on conflict (user_id, visited_date) do nothing;
  update public.profiles set last_login_at = now() where id = auth.uid();
  select count(*) into v_today from public.visit_logs where visited_date = (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_total from public.visit_logs;
  return jsonb_build_object('today', v_today, 'total', v_total);
end $$;

create or replace function public.visit_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today int; v_total int;
begin
  select count(*) into v_today from public.visit_logs where visited_date = (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_total from public.visit_logs;
  return jsonb_build_object('today', v_today, 'total', v_total);
end $$;

-- ============ 기수 코드로 자가 배정 (가입 시) ============
create or replace function public.join_cohort_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cohort public.cohorts;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_cohort from public.cohorts
    where upper(code) = upper(trim(p_code)) and deleted_at is null;
  if v_cohort.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if exists (select 1 from public.cohort_members where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'already_assigned');
  end if;
  insert into public.cohort_members (cohort_id, user_id) values (v_cohort.id, auth.uid());
  return jsonb_build_object('ok', true, 'cohort_name', v_cohort.name);
end $$;

-- ============ 열람 기록 (진입 즉시) ============
create or replace function public.record_course_view(p_course_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.cohort_courses cc
    join public.cohort_members m on m.cohort_id = cc.cohort_id
    where cc.id = p_course_id and m.user_id = auth.uid()
  ) then return; end if;
  insert into public.course_views (user_id, cohort_course_id)
  values (auth.uid(), p_course_id)
  on conflict (user_id, cohort_course_id)
  do update set view_count = public.course_views.view_count + 1;
end $$;

-- ============ 공지 조회수 ============
create or replace function public.increment_notice_view(p_notice_id uuid) returns void
language sql security definer set search_path = public as
$$ update public.notices set view_count = view_count + 1 where id = p_notice_id $$;

-- ============ 마스터 → 기수 스냅샷 복제 (설문·퀴즈 구성 포함) ============
create or replace function public.snapshot_courses_to_cohort(p_cohort_id uuid, p_master_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_master public.master_courses;
  v_new_id uuid;
  v_no int;
  v_survey public.surveys;
  v_new_survey uuid;
  v_quiz public.quizzes;
  v_new_quiz uuid;
  v_count int := 0;
  v_mid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select coalesce(max(course_no), 0) into v_no from public.cohort_courses where cohort_id = p_cohort_id;
  foreach v_mid in array p_master_ids loop
    select * into v_master from public.master_courses where id = v_mid;
    if v_master.id is null then continue; end if;
    v_no := v_no + 1;
    insert into public.cohort_courses (cohort_id, master_course_id, course_no, title, summary, body)
    values (p_cohort_id, v_master.id, v_no, v_master.title, v_master.summary, v_master.body)
    returning id into v_new_id;
    -- 첨부 복제 (같은 storage 객체 경로 공유)
    insert into public.cohort_attachments (cohort_course_id, file_path, filename, file_size)
    select v_new_id, file_path, filename, file_size from public.master_attachments where master_course_id = v_mid;
    -- 설문 구성 복제
    for v_survey in select * from public.surveys where master_course_id = v_mid loop
      insert into public.surveys (cohort_course_id, title, description, status, allow_edit)
      values (v_new_id, v_survey.title, v_survey.description, 'draft', v_survey.allow_edit)
      returning id into v_new_survey;
      insert into public.survey_questions (survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length)
      select v_new_survey, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length
      from public.survey_questions where survey_id = v_survey.id;
    end loop;
    -- 퀴즈 구성 복제
    for v_quiz in select * from public.quizzes where master_course_id = v_mid loop
      insert into public.quizzes (cohort_course_id, title, description, status, reveal_answers)
      values (v_new_id, v_quiz.title, v_quiz.description, 'draft', v_quiz.reveal_answers)
      returning id into v_new_quiz;
      insert into public.quiz_questions (quiz_id, order_no, type, text, points, options, answer)
      select v_new_quiz, order_no, type, text, points, options, answer
      from public.quiz_questions where quiz_id = v_quiz.id;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ============ 퀴즈 마감 + 전체 자동채점 (초기 버전 — 이후 마이그레이션에서 대체) ============
create or replace function public.grade_quiz(p_quiz_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_q record;
  v_ans record;
  v_correct boolean;
  v_earned numeric;
  v_total numeric;
  v_graded int := 0;
  v_norm_val text;
  v_norm_ans text;
  v_ok boolean;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (
    select 1 from public.quiz_questions
    where quiz_id = p_quiz_id and (answer is null or answer = 'null'::jsonb)
  ) then
    return jsonb_build_object('ok', false, 'error', 'missing_answers');
  end if;

  update public.quizzes set status = 'closed', graded_at = now() where id = p_quiz_id;

  for v_sub in select * from public.quiz_submissions where quiz_id = p_quiz_id loop
    v_total := 0;
    for v_q in select * from public.quiz_questions where quiz_id = p_quiz_id loop
      select * into v_ans from public.quiz_answers
        where submission_id = v_sub.id and question_id = v_q.id;
      v_correct := false;
      if v_ans.id is not null and v_ans.value is not null then
        if v_q.type = 'choice' then
          v_correct := (
            select coalesce(
              (select array_agg(x order by x) from jsonb_array_elements_text(v_ans.value) as t(x)) =
              (select array_agg(x order by x) from jsonb_array_elements_text(v_q.answer) as t(x)),
            false));
        elsif v_q.type = 'short' then
          v_norm_val := lower(regexp_replace(coalesce(v_ans.value #>> '{}', ''), '\s', '', 'g'));
          v_ok := false;
          begin
            select bool_or(lower(regexp_replace(x, '\s', '', 'g')) = v_norm_val) into v_ok
            from jsonb_array_elements_text(v_q.answer) as t(x);
          exception when others then v_ok := false;
          end;
          v_correct := coalesce(v_ok, false) and v_norm_val <> '';
        elsif v_q.type = 'ox' then
          v_correct := upper(coalesce(v_ans.value #>> '{}', '')) = upper(coalesce(v_q.answer #>> '{}', ''));
        end if;
      end if;
      v_earned := case when v_correct then v_q.points else 0 end;
      v_total := v_total + v_earned;
      if v_ans.id is not null then
        update public.quiz_answers set is_correct = v_correct, earned_score = v_earned where id = v_ans.id;
      else
        insert into public.quiz_answers (submission_id, question_id, value, is_correct, earned_score)
        values (v_sub.id, v_q.id, null, false, 0);
      end if;
    end loop;
    update public.quiz_submissions set total_score = v_total, graded = true where id = v_sub.id;
    v_graded := v_graded + 1;
  end loop;
  return jsonb_build_object('ok', true, 'graded', v_graded);
end $$;

-- ============ 관리자: 학생 기수 이동 (1인 1기수 강제) ============
create or replace function public.assign_member(p_user_id uuid, p_cohort_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.cohort_members where user_id = p_user_id;
  if p_cohort_id is not null then
    insert into public.cohort_members (cohort_id, user_id) values (p_cohort_id, p_user_id);
  end if;
end $$;

-- ============ 방문 추이 (관리자 대시보드) ============
create or replace function public.visit_series(p_days int default 30) returns table(d date, cnt bigint)
language sql stable security definer set search_path = public as $$
  select visited_date as d, count(*) as cnt
  from public.visit_logs
  where visited_date > (now() at time zone 'Asia/Seoul')::date - p_days
  group by visited_date order by visited_date
$$;
