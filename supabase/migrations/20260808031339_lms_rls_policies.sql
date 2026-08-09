-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.visit_logs enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.master_courses enable row level security;
alter table public.master_attachments enable row level security;
alter table public.cohort_courses enable row level security;
alter table public.cohort_attachments enable row level security;
alter table public.course_views enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_logs enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.notices enable row level security;
alter table public.notice_attachments enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_replies enable row level security;
alter table public.system_settings enable row level security;

-- profiles
create policy "own profile select" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy "admin delete profile" on public.profiles for delete using (public.is_super_admin());

-- visit_logs
create policy "insert own visit" on public.visit_logs for insert with check (user_id = auth.uid());
create policy "admin select visits" on public.visit_logs for select using (public.is_admin());

-- cohorts: 학습자는 자신의 기수만, 관리자는 전체
create policy "member cohort select" on public.cohorts for select
  using (public.is_admin() or id = public.my_cohort_id());
create policy "admin cohorts write" on public.cohorts for all
  using (public.is_admin()) with check (public.is_admin());

-- cohort_members
create policy "own membership select" on public.cohort_members for select
  using (user_id = auth.uid() or public.is_admin());
create policy "admin membership write" on public.cohort_members for all
  using (public.is_admin()) with check (public.is_admin());

-- master courses: admin only
create policy "admin master" on public.master_courses for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admin master att" on public.master_attachments for all
  using (public.is_admin()) with check (public.is_admin());

-- cohort courses: 소속 기수 학생 읽기 / 관리자 전체
create policy "member course select" on public.cohort_courses for select
  using (public.is_admin() or cohort_id = public.my_cohort_id());
create policy "admin course write" on public.cohort_courses for all
  using (public.is_admin()) with check (public.is_admin());

create policy "member att select" on public.cohort_attachments for select
  using (public.is_admin() or exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id()));
create policy "admin att write" on public.cohort_attachments for all
  using (public.is_admin()) with check (public.is_admin());

-- course_views
create policy "own view select" on public.course_views for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own view insert" on public.course_views for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id()));
create policy "own view update" on public.course_views for update using (user_id = auth.uid());

-- submissions
create policy "own submission select" on public.submissions for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own submission insert" on public.submissions for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id() and cc.assignment_enabled));
create policy "own submission update" on public.submissions for update using (user_id = auth.uid());
create policy "admin sublog select" on public.submission_logs for select using (public.is_admin());

-- surveys: 학생은 자신 기수의 공개/마감 설문만
create policy "member survey select" on public.surveys for select
  using (public.is_admin() or (status in ('open','closed') and exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id())));
create policy "admin survey write" on public.surveys for all
  using (public.is_admin()) with check (public.is_admin());

create policy "member sq select" on public.survey_questions for select
  using (public.is_admin() or exists (
    select 1 from public.surveys s join public.cohort_courses cc on cc.id = s.cohort_course_id
    where s.id = survey_id and s.status in ('open','closed') and cc.cohort_id = public.my_cohort_id()));
create policy "admin sq write" on public.survey_questions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "own response select" on public.survey_responses for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own response insert" on public.survey_responses for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.surveys s where s.id = survey_id and s.status = 'open'));
create policy "own response update" on public.survey_responses for update
  using (user_id = auth.uid() and exists (
    select 1 from public.surveys s where s.id = survey_id and s.status = 'open' and s.allow_edit));
create policy "own response delete" on public.survey_responses for delete
  using (user_id = auth.uid() and exists (
    select 1 from public.surveys s where s.id = survey_id and s.status = 'open' and s.allow_edit));

create policy "own answer select" on public.survey_answers for select
  using (public.is_admin() or exists (
    select 1 from public.survey_responses r where r.id = response_id and r.user_id = auth.uid()));
create policy "own answer write" on public.survey_answers for all
  using (exists (select 1 from public.survey_responses r where r.id = response_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.survey_responses r where r.id = response_id and r.user_id = auth.uid()));

-- quizzes
create policy "member quiz select" on public.quizzes for select
  using (public.is_admin() or (status in ('open','closed') and exists (
    select 1 from public.cohort_courses cc
    where cc.id = cohort_course_id and cc.cohort_id = public.my_cohort_id())));
create policy "admin quiz write" on public.quizzes for all
  using (public.is_admin()) with check (public.is_admin());

-- quiz_questions: 관리자만 직접 접근 (정답 보호 — 학생은 뷰 사용)
create policy "admin qq" on public.quiz_questions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "own qsub select" on public.quiz_submissions for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own qsub insert" on public.quiz_submissions for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.status = 'open'));

create policy "own qans select" on public.quiz_answers for select
  using (public.is_admin() or exists (
    select 1 from public.quiz_submissions s where s.id = submission_id and s.user_id = auth.uid()));
create policy "own qans insert" on public.quiz_answers for insert
  with check (exists (
    select 1 from public.quiz_submissions s join public.quizzes q on q.id = s.quiz_id
    where s.id = submission_id and s.user_id = auth.uid() and q.status = 'open'));

-- notices
create policy "member notice select" on public.notices for select
  using (public.is_admin() or cohort_id is null or cohort_id = public.my_cohort_id());
create policy "admin notice write" on public.notices for all
  using (public.is_admin()) with check (public.is_admin());
create policy "member notice att select" on public.notice_attachments for select
  using (public.is_admin() or exists (
    select 1 from public.notices n where n.id = notice_id
      and (n.cohort_id is null or n.cohort_id = public.my_cohort_id())));
create policy "admin notice att write" on public.notice_attachments for all
  using (public.is_admin()) with check (public.is_admin());

-- inquiries
create policy "own inquiry select" on public.inquiries for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own inquiry insert" on public.inquiries for insert with check (user_id = auth.uid());
create policy "admin inquiry update" on public.inquiries for update using (public.is_admin());
create policy "reply select" on public.inquiry_replies for select
  using (public.is_admin() or exists (
    select 1 from public.inquiries i where i.id = inquiry_id and i.user_id = auth.uid()));
create policy "reply insert" on public.inquiry_replies for insert
  with check (user_id = auth.uid() and (public.is_admin() or exists (
    select 1 from public.inquiries i where i.id = inquiry_id and i.user_id = auth.uid())));

-- settings
create policy "settings read" on public.system_settings for select using (auth.uid() is not null);
create policy "settings write" on public.system_settings for all
  using (public.is_super_admin()) with check (public.is_super_admin());
