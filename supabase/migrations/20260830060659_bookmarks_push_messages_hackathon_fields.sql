-- ============ 1) AI 사이트 북마크 (사용자별 1행, 항목은 jsonb 배열) ============
-- 행이 없으면 클라이언트 기본 목록을 표시하고, 첫 편집 시 행을 생성한다.
create table public.user_bookmarks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  items jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.user_bookmarks enable row level security;
create policy "bookmarks owner all" on public.user_bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ 2) 관리자 → 학생 푸시 쪽지 ============
-- push_messages: 관리자가 작성한 쪽지 원본(이력·수정·삭제·재발송)
create table public.push_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  send_count int not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- push_deliveries: 실제 발송 기록(본문 스냅샷). 학생은 자기 기수(또는 전체 대상) 발송분만 열람.
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.push_messages(id) on delete set null,
  cohort_id uuid references public.cohorts(id) on delete cascade,  -- null = 전체 기수
  body text not null,
  sender_name text not null default '',
  sent_at timestamptz not null default now()
);
create index push_deliveries_cohort_sent_idx on public.push_deliveries (cohort_id, sent_at desc);

alter table public.push_messages enable row level security;
alter table public.push_deliveries enable row level security;
create policy "push messages admin all" on public.push_messages for all
  using (public.is_admin()) with check (public.is_admin());
create policy "push deliveries admin all" on public.push_deliveries for all
  using (public.is_admin()) with check (public.is_admin());
create policy "push deliveries student select" on public.push_deliveries for select
  using (auth.uid() is not null and (cohort_id is null or cohort_id = public.my_cohort_id()));

-- 학생 화면 강제 팝업용 Realtime 발행
alter publication supabase_realtime add table public.push_deliveries;

-- ============ 3) 해커톤 결과물 추가 항목 ============
alter table public.hackathon_entries
  add column main_ai text not null default '',
  add column prompt_text text not null default '',
  add column repo_url text;
