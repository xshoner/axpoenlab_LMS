-- ============ 1) 강좌 만족도 별점 (1~5) ============
create table public.course_ratings (
  id uuid primary key default gen_random_uuid(),
  cohort_course_id uuid not null references public.cohort_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_course_id, user_id)
);
alter table public.course_ratings enable row level security;

create policy "own rating select" on public.course_ratings for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own rating insert" on public.course_ratings for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id()));
create policy "own rating update" on public.course_ratings for update
  using (user_id = auth.uid());

-- 별점 upsert RPC (학생 본인)
create or replace function public.rate_course(p_course_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  if not exists (
    select 1 from public.cohort_courses cc
    join public.cohort_members m on m.cohort_id = cc.cohort_id
    where cc.id = p_course_id and m.user_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  insert into public.course_ratings (cohort_course_id, user_id, rating)
  values (p_course_id, auth.uid(), p_rating)
  on conflict (cohort_course_id, user_id)
  do update set rating = excluded.rating, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- 별점 통계 뷰: 관리자는 전체, 학생은 자기 기수 강좌만
create view public.course_rating_stats
with (security_barrier = true, security_invoker = false) as
select
  cc.id as cohort_course_id,
  cc.cohort_id,
  cc.master_course_id,
  count(r.id)::int as rating_count,
  round(avg(r.rating)::numeric, 2) as avg_rating
from public.cohort_courses cc
join public.course_ratings r on r.cohort_course_id = cc.id
where public.is_admin() or cc.cohort_id = public.my_cohort_id()
group by cc.id;
grant select on public.course_rating_stats to authenticated;

-- ============ 2) 관리자 전용 메모 게시판 ============
create table public.admin_memos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_memos enable row level security;
create policy "admin memo all" on public.admin_memos for all
  using (public.is_admin()) with check (public.is_admin());

-- ============ 3) 설문 저장 트랜잭션 RPC (메타+문항 원자적 교체) ============
create or replace function public.save_survey(p_survey_id uuid, p_meta jsonb, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_survey_id; v_q jsonb; v_no int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_id is null then
    insert into public.surveys (cohort_course_id, title, description, allow_edit, status)
    values (
      (p_meta->>'cohort_course_id')::uuid,
      p_meta->>'title',
      coalesce(p_meta->>'description', ''),
      coalesce((p_meta->>'allow_edit')::boolean, false),
      'draft')
    returning id into v_id;
  else
    update public.surveys set
      cohort_course_id = (p_meta->>'cohort_course_id')::uuid,
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

-- ============ 4) 퀴즈 저장 트랜잭션 RPC ============
create or replace function public.save_quiz(p_quiz_id uuid, p_meta jsonb, p_questions jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_quiz_id; v_q jsonb; v_no int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_id is null then
    insert into public.quizzes (cohort_course_id, title, description, reveal_answers, status)
    values (
      (p_meta->>'cohort_course_id')::uuid,
      p_meta->>'title',
      coalesce(p_meta->>'description', ''),
      coalesce((p_meta->>'reveal_answers')::boolean, true),
      'draft')
    returning id into v_id;
  else
    update public.quizzes set
      cohort_course_id = (p_meta->>'cohort_course_id')::uuid,
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

-- ============ 5) 퀴즈 제출 트랜잭션 RPC (멱등: 중복 제출 무해) ============
create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub uuid; v_a jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.quizzes q
    join public.cohort_courses cc on cc.id = q.cohort_course_id
    join public.cohort_members m on m.cohort_id = cc.cohort_id
    where q.id = p_quiz_id and q.status = 'open' and m.user_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  select id into v_sub from public.quiz_submissions
    where quiz_id = p_quiz_id and user_id = auth.uid();
  if v_sub is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into public.quiz_submissions (quiz_id, user_id)
  values (p_quiz_id, auth.uid()) returning id into v_sub;
  for v_a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    if exists (select 1 from public.quiz_questions
               where id = (v_a->>'question_id')::uuid and quiz_id = p_quiz_id) then
      insert into public.quiz_answers (submission_id, question_id, value)
      values (v_sub, (v_a->>'question_id')::uuid, v_a->'value')
      on conflict (submission_id, question_id) do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ============ 6) 설문 제출 트랜잭션 RPC (응답 원자적 교체) ============
create or replace function public.submit_survey(p_survey_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_resp uuid; v_a jsonb; v_survey public.surveys;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select s.* into v_survey from public.surveys s
  join public.cohort_courses cc on cc.id = s.cohort_course_id
  join public.cohort_members m on m.cohort_id = cc.cohort_id
  where s.id = p_survey_id and m.user_id = auth.uid();
  if v_survey.id is null or v_survey.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  select id into v_resp from public.survey_responses
    where survey_id = p_survey_id and user_id = auth.uid();
  if v_resp is not null then
    if not v_survey.allow_edit then
      return jsonb_build_object('ok', false, 'error', 'already_submitted');
    end if;
    update public.survey_responses set submitted_at = now() where id = v_resp;
    delete from public.survey_answers where response_id = v_resp;
  else
    insert into public.survey_responses (survey_id, user_id)
    values (p_survey_id, auth.uid()) returning id into v_resp;
  end if;
  for v_a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    if exists (select 1 from public.survey_questions
               where id = (v_a->>'question_id')::uuid and survey_id = p_survey_id) then
      insert into public.survey_answers (response_id, question_id, value)
      values (v_resp, (v_a->>'question_id')::uuid, v_a->'value')
      on conflict (response_id, question_id) do update set value = excluded.value;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;
