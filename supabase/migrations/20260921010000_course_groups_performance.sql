-- 강좌 그룹, 관리자 목록 경량화, 정렬/이동 RPC와 조회 성능 개선

create table public.master_course_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index master_course_groups_one_default_idx
  on public.master_course_groups (is_default) where is_default;

create table public.cohort_course_groups (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  source_master_group_id uuid references public.master_course_groups(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order int not null default 0,
  is_default boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index cohort_course_groups_one_default_idx
  on public.cohort_course_groups (cohort_id) where is_default;
create unique index cohort_course_groups_source_idx
  on public.cohort_course_groups (cohort_id, source_master_group_id)
  where source_master_group_id is not null;

insert into public.master_course_groups (name, sort_order, is_default)
values ('기본 강좌', 1, true);

insert into public.cohort_course_groups (cohort_id, name, sort_order, is_default, is_published)
select id, '기본 강좌', 1, true, true
from public.cohorts
where deleted_at is null;

alter table public.master_courses add column group_id uuid;
update public.master_courses
set group_id = (select id from public.master_course_groups where is_default limit 1);
alter table public.master_courses alter column group_id set not null;
alter table public.master_courses
  add constraint master_courses_group_id_fkey foreign key (group_id)
  references public.master_course_groups(id) on delete restrict;

alter table public.cohort_courses add column group_id uuid;
update public.cohort_courses as course
set group_id = grp.id
from public.cohort_course_groups as grp
where grp.cohort_id = course.cohort_id and grp.is_default;
alter table public.cohort_courses alter column group_id set not null;
alter table public.cohort_courses
  add constraint cohort_courses_group_id_fkey foreign key (group_id)
  references public.cohort_course_groups(id) on delete restrict;

create or replace function private.create_default_course_group_for_cohort()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cohort_course_groups
    (cohort_id, name, sort_order, is_default, is_published)
  values (new.id, '기본 강좌', 1, true, false);
  return new;
end $$;

create trigger create_default_course_group_after_cohort
after insert on public.cohorts
for each row execute function private.create_default_course_group_for_cohort();

create index cohort_courses_cohort_group_no_idx
  on public.cohort_courses (cohort_id, group_id, course_no);
create index cohort_courses_master_idx on public.cohort_courses (master_course_id);
create index master_courses_group_sort_idx on public.master_courses (group_id, sort_order);
create index master_attachments_course_idx on public.master_attachments (master_course_id);
create index cohort_attachments_course_idx on public.cohort_attachments (cohort_course_id);
create index course_ratings_course_idx on public.course_ratings (cohort_course_id);
create index surveys_cohort_course_idx on public.surveys (cohort_course_id);
create index surveys_master_course_idx on public.surveys (master_course_id);
create index quizzes_cohort_course_idx on public.quizzes (cohort_course_id);
create index quizzes_master_course_idx on public.quizzes (master_course_id);

alter table public.master_course_groups enable row level security;
alter table public.cohort_course_groups enable row level security;

create policy "admin master groups" on public.master_course_groups for all
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "cohort groups select" on public.cohort_course_groups for select
  using (
    (select public.is_admin())
    or (is_published and cohort_id = (select public.my_cohort_id()))
  );
create policy "admin cohort groups write" on public.cohort_course_groups for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 비공개 그룹은 학생이 테이블/RPC를 직접 호출해도 읽을 수 없다.
alter policy "member course select" on public.cohort_courses
  using (
    (select public.is_active_user()) and (
      (select public.is_admin())
      or (
        cohort_id = (select public.my_cohort_id())
        and exists (
          select 1 from public.cohort_course_groups as grp
          where grp.id = group_id and grp.is_published
        )
      )
    )
  );

alter policy "admin master" on public.master_courses
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin master att" on public.master_attachments
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin course write" on public.cohort_courses
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin att write" on public.cohort_attachments
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "member att select" on public.cohort_attachments
  using (
    (select public.is_active_user()) and (
      (select public.is_admin()) or exists (
        select 1
        from public.cohort_courses as course
        join public.cohort_course_groups as grp on grp.id = course.group_id
        where course.id = cohort_course_id
          and course.cohort_id = (select public.my_cohort_id())
          and grp.is_published
      )
    )
  );

alter policy "own view insert" on public.course_views
  with check (
    (select public.is_active_user()) and user_id = auth.uid() and exists (
      select 1
      from public.cohort_courses as course
      join public.cohort_course_groups as grp on grp.id = course.group_id
      where course.id = cohort_course_id
        and course.cohort_id = (select public.my_cohort_id())
        and grp.is_published
    )
  );

alter policy "own submission insert" on public.submissions
  with check (
    (select public.is_active_user()) and user_id = auth.uid() and exists (
      select 1
      from public.cohort_courses as course
      join public.cohort_course_groups as grp on grp.id = course.group_id
      where course.id = cohort_course_id
        and course.cohort_id = (select public.my_cohort_id())
        and course.assignment_enabled
        and grp.is_published
    )
  );

alter policy "member survey select" on public.surveys
  using (
    (select public.is_active_user()) and (
      (select public.is_admin()) or (
        status in ('open', 'closed') and exists (
          select 1
          from public.cohort_courses as course
          join public.cohort_course_groups as grp on grp.id = course.group_id
          where course.id = cohort_course_id
            and course.cohort_id = (select public.my_cohort_id())
            and grp.is_published
        )
      )
    )
  );

alter policy "member sq select" on public.survey_questions
  using (
    (select public.is_active_user()) and (
      (select public.is_admin()) or exists (
        select 1
        from public.surveys as survey
        join public.cohort_courses as course on course.id = survey.cohort_course_id
        join public.cohort_course_groups as grp on grp.id = course.group_id
        where survey.id = survey_id
          and survey.status in ('open', 'closed')
          and course.cohort_id = (select public.my_cohort_id())
          and grp.is_published
      )
    )
  );

alter policy "member quiz select" on public.quizzes
  using (
    (select public.is_active_user()) and (
      (select public.is_admin()) or (
        status in ('open', 'closed') and exists (
          select 1
          from public.cohort_courses as course
          join public.cohort_course_groups as grp on grp.id = course.group_id
          where course.id = cohort_course_id
            and course.cohort_id = (select public.my_cohort_id())
            and grp.is_published
        )
      )
    )
  );

-- 목록에서는 본문/과제 안내/첨부 행을 제외하고 필요한 통계만 반환한다.
create or replace function public.admin_master_course_list(p_group_id uuid)
returns table (
  id uuid, group_id uuid, title text, summary text, sort_order int,
  assignment_enabled boolean, attachment_count int,
  avg_rating numeric, rating_count int
)
language sql stable security definer set search_path = '' as $$
  select
    course.id,
    course.group_id,
    course.title,
    course.summary,
    course.sort_order,
    course.assignment_enabled,
    (select count(*)::int from public.master_attachments as attachment
      where attachment.master_course_id = course.id),
    rating.avg_rating,
    coalesce(rating.rating_count, 0)
  from public.master_courses as course
  left join lateral (
    select round(avg(course_rating.rating)::numeric, 2) as avg_rating,
           count(course_rating.id)::int as rating_count
    from public.cohort_courses as cohort_course
    join public.course_ratings as course_rating
      on course_rating.cohort_course_id = cohort_course.id
    where cohort_course.master_course_id = course.id
  ) as rating on true
  where (select public.is_admin()) and course.group_id = p_group_id
  order by course.sort_order, course.created_at
$$;

create or replace function public.admin_cohort_course_list(p_cohort_id uuid, p_group_id uuid)
returns table (
  id uuid, group_id uuid, master_course_id uuid, title text, summary text,
  course_no int, assignment_enabled boolean, attachment_count int,
  avg_rating numeric, rating_count int
)
language sql stable security definer set search_path = '' as $$
  select
    course.id,
    course.group_id,
    course.master_course_id,
    course.title,
    course.summary,
    course.course_no,
    course.assignment_enabled,
    (select count(*)::int from public.cohort_attachments as attachment
      where attachment.cohort_course_id = course.id),
    rating.avg_rating,
    coalesce(rating.rating_count, 0)
  from public.cohort_courses as course
  left join lateral (
    select round(avg(course_rating.rating)::numeric, 2) as avg_rating,
           count(course_rating.id)::int as rating_count
    from public.cohort_courses as rated_course
    join public.course_ratings as course_rating
      on course_rating.cohort_course_id = rated_course.id
    where rated_course.id = course.id
       or (course.master_course_id is not null
           and rated_course.master_course_id = course.master_course_id)
  ) as rating on true
  where (select public.is_admin())
    and course.cohort_id = p_cohort_id
    and course.group_id = p_group_id
  order by course.course_no, course.created_at
$$;

create or replace function public.student_course_list(p_group_id uuid)
returns table (
  id uuid, group_id uuid, course_no int, title text, summary text,
  attachment_count int, survey_count int, quiz_count int, viewed boolean,
  avg_rating numeric, rating_count int
)
language sql stable security definer set search_path = '' as $$
  select
    course.id,
    course.group_id,
    course.course_no,
    course.title,
    course.summary,
    (select count(*)::int from public.cohort_attachments as attachment
      where attachment.cohort_course_id = course.id),
    (select count(*)::int from public.surveys as survey
      where survey.cohort_course_id = course.id and survey.status <> 'draft'),
    (select count(*)::int from public.quizzes as quiz
      where quiz.cohort_course_id = course.id and quiz.status <> 'draft'),
    exists (
      select 1 from public.course_views as course_view
      where course_view.cohort_course_id = course.id and course_view.user_id = auth.uid()
    ),
    rating.avg_rating,
    coalesce(rating.rating_count, 0)
  from public.cohort_courses as course
  join public.cohort_course_groups as grp on grp.id = course.group_id
  left join lateral (
    select round(avg(course_rating.rating)::numeric, 2) as avg_rating,
           count(course_rating.id)::int as rating_count
    from public.cohort_courses as rated_course
    join public.course_ratings as course_rating
      on course_rating.cohort_course_id = rated_course.id
    where rated_course.id = course.id
       or (course.master_course_id is not null
           and rated_course.master_course_id = course.master_course_id)
  ) as rating on true
  where (select public.is_active_user())
    and course.cohort_id = (select public.my_cohort_id())
    and course.group_id = p_group_id
    and grp.is_published
  order by course.course_no, course.created_at
$$;

create or replace function public.admin_reorder_master_courses(p_group_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'forbidden'; end if;
  if exists (
    select 1 from unnest(p_ids) as requested(id)
    left join public.master_courses as course
      on course.id = requested.id and course.group_id = p_group_id
    where course.id is null
  ) then raise exception 'invalid course group'; end if;

  update public.master_courses as course
  set sort_order = ordered.position
  from unnest(p_ids) with ordinality as ordered(id, position)
  where course.id = ordered.id;
end $$;

create or replace function public.admin_reorder_cohort_courses(p_group_id uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'forbidden'; end if;
  if exists (
    select 1 from unnest(p_ids) as requested(id)
    left join public.cohort_courses as course
      on course.id = requested.id and course.group_id = p_group_id
    where course.id is null
  ) then raise exception 'invalid course group'; end if;

  update public.cohort_courses as course
  set course_no = ordered.position
  from unnest(p_ids) with ordinality as ordered(id, position)
  where course.id = ordered.id;
end $$;

-- 마스터 강좌 이동/복사. 복사 시 첨부, 설문, 퀴즈 템플릿도 함께 복제한다.
create or replace function public.admin_transfer_master_course(
  p_course_id uuid, p_target_group_id uuid, p_copy boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source_course public.master_courses;
  new_course_id uuid;
  source_survey public.surveys;
  new_survey_id uuid;
  source_quiz public.quizzes;
  new_quiz_id uuid;
  next_order int;
begin
  if not (select public.is_admin()) then raise exception 'forbidden'; end if;
  select * into source_course from public.master_courses where id = p_course_id;
  if source_course.id is null then raise exception 'course not found'; end if;
  if not exists (select 1 from public.master_course_groups where id = p_target_group_id)
    then raise exception 'group not found'; end if;
  select coalesce(max(sort_order), 0) + 1 into next_order
    from public.master_courses where group_id = p_target_group_id;

  if not p_copy then
    update public.master_courses set group_id = p_target_group_id, sort_order = next_order
      where id = p_course_id;
    with numbered as (
      select id, row_number() over (order by sort_order, created_at)::int as n
      from public.master_courses where group_id = source_course.group_id
    )
    update public.master_courses as course set sort_order = numbered.n
      from numbered where course.id = numbered.id;
    return p_course_id;
  end if;

  insert into public.master_courses
    (group_id, title, summary, body, sort_order, assignment_enabled, assignment_text, assignment_due)
  values
    (p_target_group_id, source_course.title, source_course.summary, source_course.body,
     next_order, source_course.assignment_enabled, source_course.assignment_text, source_course.assignment_due)
  returning id into new_course_id;

  insert into public.master_attachments (master_course_id, file_path, filename, file_size)
  select new_course_id, file_path, filename, file_size
  from public.master_attachments where master_course_id = p_course_id;

  for source_survey in select * from public.surveys where master_course_id = p_course_id loop
    insert into public.surveys (master_course_id, title, description, status, allow_edit)
    values (new_course_id, source_survey.title, source_survey.description, 'draft', source_survey.allow_edit)
    returning id into new_survey_id;
    insert into public.survey_questions
      (survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length)
    select new_survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length
    from public.survey_questions where survey_id = source_survey.id;
  end loop;

  for source_quiz in select * from public.quizzes where master_course_id = p_course_id loop
    insert into public.quizzes (master_course_id, title, description, status, reveal_answers)
    values (new_course_id, source_quiz.title, source_quiz.description, 'draft', source_quiz.reveal_answers)
    returning id into new_quiz_id;
    insert into public.quiz_questions (quiz_id, order_no, type, text, points, options, answer)
    select new_quiz_id, order_no, type, text, points, options, answer
    from public.quiz_questions where quiz_id = source_quiz.id;
  end loop;
  return new_course_id;
end $$;

-- 기수 강좌 이동/복사. 복사본에는 기존 학생 열람/응답/제출 기록을 복제하지 않는다.
create or replace function public.admin_transfer_cohort_course(
  p_course_id uuid, p_target_group_id uuid, p_copy boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source_course public.cohort_courses;
  new_course_id uuid;
  source_survey public.surveys;
  new_survey_id uuid;
  source_quiz public.quizzes;
  new_quiz_id uuid;
  next_no int;
begin
  if not (select public.is_admin()) then raise exception 'forbidden'; end if;
  select * into source_course from public.cohort_courses where id = p_course_id;
  if source_course.id is null then raise exception 'course not found'; end if;
  if not exists (
    select 1 from public.cohort_course_groups
    where id = p_target_group_id and cohort_id = source_course.cohort_id
  ) then raise exception 'group not found'; end if;
  select coalesce(max(course_no), 0) + 1 into next_no
    from public.cohort_courses where group_id = p_target_group_id;

  if not p_copy then
    update public.cohort_courses set group_id = p_target_group_id, course_no = next_no
      where id = p_course_id;
    with numbered as (
      select id, row_number() over (order by course_no, created_at)::int as n
      from public.cohort_courses where group_id = source_course.group_id
    )
    update public.cohort_courses as course set course_no = numbered.n
      from numbered where course.id = numbered.id;
    return p_course_id;
  end if;

  insert into public.cohort_courses
    (cohort_id, group_id, master_course_id, course_no, title, summary, body,
     external_url, assignment_enabled, assignment_text, assignment_due)
  values
    (source_course.cohort_id, p_target_group_id, source_course.master_course_id, next_no,
     source_course.title, source_course.summary, source_course.body, source_course.external_url,
     source_course.assignment_enabled, source_course.assignment_text, source_course.assignment_due)
  returning id into new_course_id;

  insert into public.cohort_attachments (cohort_course_id, file_path, filename, file_size)
  select new_course_id, file_path, filename, file_size
  from public.cohort_attachments where cohort_course_id = p_course_id;

  for source_survey in select * from public.surveys where cohort_course_id = p_course_id loop
    insert into public.surveys (cohort_course_id, title, description, status, allow_edit)
    values (new_course_id, source_survey.title, source_survey.description, 'draft', source_survey.allow_edit)
    returning id into new_survey_id;
    insert into public.survey_questions
      (survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length)
    select new_survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length
    from public.survey_questions where survey_id = source_survey.id;
  end loop;

  for source_quiz in select * from public.quizzes where cohort_course_id = p_course_id loop
    insert into public.quizzes (cohort_course_id, title, description, status, reveal_answers)
    values (new_course_id, source_quiz.title, source_quiz.description, 'draft', source_quiz.reveal_answers)
    returning id into new_quiz_id;
    insert into public.quiz_questions (quiz_id, order_no, type, text, points, options, answer)
    select new_quiz_id, order_no, type, text, points, options, answer
    from public.quiz_questions where quiz_id = source_quiz.id;
  end loop;
  return new_course_id;
end $$;

-- 마스터 그룹을 유지해 기수 그룹으로 스냅샷 복제한다.
drop function if exists public.snapshot_courses_to_cohort(uuid, uuid[]);
create function public.snapshot_courses_to_cohort(
  p_cohort_id uuid, p_master_ids uuid[], p_publish boolean default true
) returns int language plpgsql security definer set search_path = '' as $$
declare
  source_course public.master_courses;
  target_group_id uuid;
  new_course_id uuid;
  source_survey public.surveys;
  new_survey_id uuid;
  source_quiz public.quizzes;
  new_quiz_id uuid;
  next_no int;
  copied int := 0;
  master_id uuid;
begin
  if not (select public.is_admin()) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.cohorts where id = p_cohort_id and deleted_at is null)
    then raise exception 'cohort not found'; end if;

  foreach master_id in array p_master_ids loop
    select * into source_course from public.master_courses where id = master_id;
    if source_course.id is null then continue; end if;

    select id into target_group_id from public.cohort_course_groups
      where cohort_id = p_cohort_id and source_master_group_id = source_course.group_id;
    if target_group_id is null and exists (
      select 1 from public.master_course_groups
      where id = source_course.group_id and is_default
    ) then
      select id into target_group_id from public.cohort_course_groups
        where cohort_id = p_cohort_id and is_default;
      update public.cohort_course_groups
      set source_master_group_id = source_course.group_id,
          is_published = is_published or p_publish
      where id = target_group_id;
    end if;
    if target_group_id is null then
      insert into public.cohort_course_groups
        (cohort_id, source_master_group_id, name, sort_order, is_default, is_published)
      select p_cohort_id, grp.id, grp.name, grp.sort_order, false, p_publish
      from public.master_course_groups as grp where grp.id = source_course.group_id
      returning id into target_group_id;
    elsif p_publish then
      update public.cohort_course_groups set is_published = true where id = target_group_id;
    end if;

    select coalesce(max(course_no), 0) + 1 into next_no
      from public.cohort_courses where group_id = target_group_id;
    insert into public.cohort_courses
      (cohort_id, group_id, master_course_id, course_no, title, summary, body,
       assignment_enabled, assignment_text, assignment_due)
    values
      (p_cohort_id, target_group_id, source_course.id, next_no, source_course.title,
       source_course.summary, source_course.body, source_course.assignment_enabled,
       source_course.assignment_text, source_course.assignment_due)
    returning id into new_course_id;

    insert into public.cohort_attachments (cohort_course_id, file_path, filename, file_size)
    select new_course_id, file_path, filename, file_size
    from public.master_attachments where master_course_id = source_course.id;

    for source_survey in select * from public.surveys where master_course_id = source_course.id loop
      insert into public.surveys (cohort_course_id, title, description, status, allow_edit)
      values (new_course_id, source_survey.title, source_survey.description, 'draft', source_survey.allow_edit)
      returning id into new_survey_id;
      insert into public.survey_questions
        (survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length)
      select new_survey_id, order_no, type, required, text, options, multiple, has_other, grid_rows, grid_cols, max_length
      from public.survey_questions where survey_id = source_survey.id;
    end loop;

    for source_quiz in select * from public.quizzes where master_course_id = source_course.id loop
      insert into public.quizzes (cohort_course_id, title, description, status, reveal_answers)
      values (new_course_id, source_quiz.title, source_quiz.description, 'draft', source_quiz.reveal_answers)
      returning id into new_quiz_id;
      insert into public.quiz_questions (quiz_id, order_no, type, text, points, options, answer)
      select new_quiz_id, order_no, type, text, points, options, answer
      from public.quiz_questions where quiz_id = source_quiz.id;
    end loop;
    copied := copied + 1;
  end loop;
  return copied;
end $$;

-- 기존 SECURITY DEFINER 읽기/RPC에도 그룹 공개 조건을 적용한다.
create or replace function private.quiz_questions_student_rows()
returns table (
  id uuid, quiz_id uuid, order_no int, type text, text text,
  points numeric, options jsonb, answer jsonb
)
language sql stable security definer set search_path = '' as $$
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
      (select public.is_admin())
      or exists (
        select 1
        from public.cohort_courses as course
        join public.cohort_course_groups as grp on grp.id = course.group_id
        where course.id = quiz.cohort_course_id
          and course.cohort_id = (select public.my_cohort_id())
          and grp.is_published
      )
    )
$$;

create or replace function private.course_rating_stats_rows()
returns table (
  cohort_course_id uuid, cohort_id uuid, master_course_id uuid,
  rating_count int, avg_rating numeric
)
language sql stable security definer set search_path = '' as $$
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
  join public.cohort_course_groups as grp on grp.id = course.group_id
  join aggregate_ratings
    on aggregate_ratings.group_key = coalesce(course.master_course_id::text, course.id::text)
  where auth.uid() is not null
    and (
      (select public.is_admin())
      or (course.cohort_id = (select public.my_cohort_id()) and grp.is_published)
    )
$$;

create or replace function public.record_course_view(p_course_id uuid) returns void
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
  ) then return; end if;
  perform public.record_course_view_active_impl(p_course_id);
end $$;

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
  ) then raise exception 'course unavailable'; end if;
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
  ) then raise exception 'quiz unavailable'; end if;
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
  ) then raise exception 'survey unavailable'; end if;
  return public.submit_survey_active_impl(p_survey_id, p_answers);
end $$;

revoke all on function public.admin_master_course_list(uuid) from public, anon;
revoke all on function public.admin_cohort_course_list(uuid, uuid) from public, anon;
revoke all on function public.student_course_list(uuid) from public, anon;
revoke all on function public.admin_reorder_master_courses(uuid, uuid[]) from public, anon;
revoke all on function public.admin_reorder_cohort_courses(uuid, uuid[]) from public, anon;
revoke all on function public.admin_transfer_master_course(uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_transfer_cohort_course(uuid, uuid, boolean) from public, anon;
revoke all on function public.snapshot_courses_to_cohort(uuid, uuid[], boolean) from public, anon;

grant execute on function public.admin_master_course_list(uuid) to authenticated;
grant execute on function public.admin_cohort_course_list(uuid, uuid) to authenticated;
grant execute on function public.student_course_list(uuid) to authenticated;
grant execute on function public.admin_reorder_master_courses(uuid, uuid[]) to authenticated;
grant execute on function public.admin_reorder_cohort_courses(uuid, uuid[]) to authenticated;
grant execute on function public.admin_transfer_master_course(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_transfer_cohort_course(uuid, uuid, boolean) to authenticated;
grant execute on function public.snapshot_courses_to_cohort(uuid, uuid[], boolean) to authenticated;
