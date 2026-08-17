-- ============ 마스터 강좌 라이브러리: 과제·설문·퀴즈 템플릿 지원 ============
-- 설문·퀴즈는 이미 master_course_id 이중 구조 + 스냅샷 복제가 구현되어 있으므로
-- (1) 마스터 과제 필드, (2) 스냅샷 시 과제 복제, (3) save_survey/save_quiz의 마스터 연결만 추가한다.

-- 1) 마스터 강좌 과제 필드
alter table public.master_courses
  add column if not exists assignment_enabled boolean not null default false,
  add column if not exists assignment_text text not null default '',
  add column if not exists assignment_due timestamptz;

-- 2) 스냅샷 RPC: 과제 구성도 함께 복제
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
    insert into public.cohort_courses
      (cohort_id, master_course_id, course_no, title, summary, body,
       assignment_enabled, assignment_text, assignment_due)
    values
      (p_cohort_id, v_master.id, v_no, v_master.title, v_master.summary, v_master.body,
       v_master.assignment_enabled, v_master.assignment_text, v_master.assignment_due)
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

-- 3) save_survey: p_meta에 master_course_id가 오면 마스터 템플릿 설문으로 저장
create or replace function public.save_survey(p_survey_id uuid, p_meta jsonb, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_survey_id; v_q jsonb; v_no int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_id is null then
    insert into public.surveys (cohort_course_id, master_course_id, title, description, allow_edit, status)
    values (
      (p_meta->>'cohort_course_id')::uuid,
      (p_meta->>'master_course_id')::uuid,
      p_meta->>'title',
      coalesce(p_meta->>'description', ''),
      coalesce((p_meta->>'allow_edit')::boolean, false),
      'draft')
    returning id into v_id;
  else
    update public.surveys set
      cohort_course_id = (p_meta->>'cohort_course_id')::uuid,
      master_course_id = (p_meta->>'master_course_id')::uuid,
      title = p_meta->>'title',
      description = coalesce(p_meta->>'description', ''),
      allow_edit = coalesce((p_meta->>'allow_edit')::boolean, false)
    where id = v_id;
    if not found then raise exception 'survey not found'; end if;
    delete from public.survey_questions where survey_id = v_id;
  end if;
  for v_q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into public.survey_questions
      (survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length)
    values (
      v_id, v_no, v_q->>'type',
      coalesce((v_q->>'required')::boolean, false),
      coalesce(v_q->>'text', ''),
      coalesce(v_q->'options', '[]'::jsonb),
      coalesce((v_q->>'multiple')::boolean, false),
      coalesce((v_q->>'has_other')::boolean, false),
      coalesce(v_q->'grid_rows', '[]'::jsonb),
      coalesce(v_q->'grid_cols', '[]'::jsonb),
      nullif(v_q->>'max_length', '')::int);
  end loop;
  return v_id;
end $$;

-- 4) save_quiz: p_meta에 master_course_id가 오면 마스터 템플릿 퀴즈로 저장
create or replace function public.save_quiz(p_quiz_id uuid, p_meta jsonb, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_quiz_id; v_q jsonb; v_no int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_id is null then
    insert into public.quizzes (cohort_course_id, master_course_id, title, description, reveal_answers, status)
    values (
      (p_meta->>'cohort_course_id')::uuid,
      (p_meta->>'master_course_id')::uuid,
      p_meta->>'title',
      coalesce(p_meta->>'description', ''),
      coalesce((p_meta->>'reveal_answers')::boolean, true),
      'draft')
    returning id into v_id;
  else
    update public.quizzes set
      cohort_course_id = (p_meta->>'cohort_course_id')::uuid,
      master_course_id = (p_meta->>'master_course_id')::uuid,
      title = p_meta->>'title',
      description = coalesce(p_meta->>'description', ''),
      reveal_answers = coalesce((p_meta->>'reveal_answers')::boolean, true)
    where id = v_id;
    if not found then raise exception 'quiz not found'; end if;
    delete from public.quiz_questions where quiz_id = v_id;
  end if;
  for v_q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into public.quiz_questions (quiz_id, order_no, type, text, points, options, answer)
    values (
      v_id, v_no, v_q->>'type',
      coalesce(v_q->>'text', ''),
      coalesce((v_q->>'points')::numeric, 1),
      coalesce(v_q->'options', '[]'::jsonb),
      case when v_q->'answer' = 'null'::jsonb then null else v_q->'answer' end);
  end loop;
  return v_id;
end $$;
