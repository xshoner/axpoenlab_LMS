-- ============ AX오픈랩 LMS core schema ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default '',
  org text not null default '',
  role text not null default 'student' check (role in ('student','admin','super_admin')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.visit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  visited_date date not null default (now() at time zone 'Asia/Seoul')::date,
  unique (user_id, visited_date)
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  start_date date,
  end_date date,
  status text not null default 'preparing' check (status in ('preparing','active','closed')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table public.master_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  body text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.master_attachments (
  id uuid primary key default gen_random_uuid(),
  master_course_id uuid not null references public.master_courses(id) on delete cascade,
  file_path text not null,
  filename text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.cohort_courses (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  master_course_id uuid references public.master_courses(id) on delete set null,
  course_no int not null default 1,
  title text not null,
  summary text not null default '',
  body text not null default '',
  external_url text,
  assignment_enabled boolean not null default false,
  assignment_text text not null default '',
  assignment_due timestamptz,
  created_at timestamptz not null default now()
);

create table public.cohort_attachments (
  id uuid primary key default gen_random_uuid(),
  cohort_course_id uuid not null references public.cohort_courses(id) on delete cascade,
  file_path text not null,
  filename text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.course_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_course_id uuid not null references public.cohort_courses(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  view_count int not null default 1,
  unique (user_id, cohort_course_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_course_id uuid not null references public.cohort_courses(id) on delete cascade,
  type text not null check (type in ('file','url')),
  file_path text,
  original_filename text,
  file_size bigint,
  url text,
  submitted_at timestamptz not null default now(),
  unique (user_id, cohort_course_id)
);

create table public.submission_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  cohort_course_id uuid not null,
  type text not null,
  original_filename text,
  url text,
  submitted_at timestamptz not null default now()
);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  cohort_course_id uuid references public.cohort_courses(id) on delete cascade,
  master_course_id uuid references public.master_courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','open','closed')),
  allow_edit boolean not null default false,
  created_at timestamptz not null default now(),
  check (cohort_course_id is not null or master_course_id is not null)
);

create table public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  order_no int not null default 1,
  type text not null check (type in ('choice','short','long','grid')),
  required boolean not null default false,
  text text not null default '',
  options jsonb not null default '[]',
  multiple boolean not null default false,
  has_other boolean not null default false,
  grid_rows jsonb not null default '[]',
  grid_cols jsonb not null default '[]',
  max_length int
);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (survey_id, user_id)
);

create table public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  value jsonb,
  unique (response_id, question_id)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  cohort_course_id uuid references public.cohort_courses(id) on delete cascade,
  master_course_id uuid references public.master_courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','open','closed')),
  reveal_answers boolean not null default true,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  check (cohort_course_id is not null or master_course_id is not null)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  order_no int not null default 1,
  type text not null check (type in ('choice','short','ox')),
  text text not null default '',
  points numeric not null default 1,
  options jsonb not null default '[]',
  answer jsonb
);

create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  total_score numeric,
  graded boolean not null default false,
  unique (quiz_id, user_id)
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  value jsonb,
  is_correct boolean,
  earned_score numeric,
  unique (submission_id, question_id)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  cohort_id uuid references public.cohorts(id) on delete cascade,
  pinned boolean not null default false,
  view_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notice_attachments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  file_path text not null,
  filename text not null,
  file_size bigint not null default 0
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  file_path text,
  filename text,
  cohort_course_id uuid references public.cohort_courses(id) on delete set null,
  status text not null default 'open' check (status in ('open','answered')),
  created_at timestamptz not null default now()
);

create table public.inquiry_replies (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values
  ('allowed_extensions', '["pdf","docx","pptx","xlsx","hwp","hwpx","zip","ipynb","py","txt","png","jpg"]'),
  ('max_file_size_mb', '5'),
  ('login_lock_attempts', '5'),
  ('login_lock_minutes', '10'),
  ('show_visitor_counter', 'true');

-- ============ helper functions ============
create or replace function public.current_role_of() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.current_role_of() in ('admin','super_admin'), false) $$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.current_role_of() = 'super_admin', false) $$;

create or replace function public.my_cohort_id() returns uuid
language sql stable security definer set search_path = public as
$$ select cohort_id from public.cohort_members where user_id = auth.uid() $$;

-- profile auto-creation on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, org, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_user_meta_data->>'org',''),
    case when new.email = 'xshoner@gmail.com' then 'super_admin' else 'student' end
  ) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- prevent self role/status escalation
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email then
      raise exception 'not allowed';
    end if;
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() and auth.uid() is not null then
    -- 일반 관리자는 역할 변경 불가 (슈퍼관리자만)
    raise exception 'only super admin can change roles';
  end if;
  return new;
end $$;

create trigger guard_profile_update before update on public.profiles
for each row execute function public.guard_profile_update();

-- submission history log
create or replace function public.log_submission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.submission_logs (user_id, cohort_course_id, type, original_filename, url, submitted_at)
  values (new.user_id, new.cohort_course_id, new.type, new.original_filename, new.url, now());
  return new;
end $$;

create trigger log_submission after insert or update on public.submissions
for each row execute function public.log_submission();
