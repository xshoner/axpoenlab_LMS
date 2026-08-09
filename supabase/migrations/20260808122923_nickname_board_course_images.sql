-- 1) 관리자 닉네임
alter table public.profiles add column if not exists nickname text not null default '';

-- 학생도 운영진 표시명(닉네임)을 볼 수 있도록 안전한 뷰 제공 (id/name/nickname/role만 노출)
create or replace view public.staff_directory as
  select id, name, nickname, role from public.profiles where role in ('admin','super_admin');
grant select on public.staff_directory to authenticated;

-- 2) 공개게시판
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;

create policy "board post select" on public.board_posts for select to authenticated using (true);
create policy "board post insert" on public.board_posts for insert to authenticated with check (user_id = auth.uid());
create policy "board post delete" on public.board_posts for delete to authenticated using (user_id = auth.uid() or is_admin());
create policy "board comment select" on public.board_comments for select to authenticated using (true);
create policy "board comment insert" on public.board_comments for insert to authenticated with check (user_id = auth.uid());
create policy "board comment delete" on public.board_comments for delete to authenticated using (user_id = auth.uid() or is_admin());

-- 3) 강좌 본문 이미지용 공개 버킷
-- ⚠️ 공개 범위 주의: course-images 버킷은 의도적으로 public입니다.
--    강좌 본문에 삽입되는 이미지 전용이며, 업로드/삭제는 관리자만 가능합니다.
--    개인정보·자료 파일은 반드시 비공개 버킷(course-files 등) + 서명 URL을 사용하세요.
insert into storage.buckets (id, name, public) values ('course-images', 'course-images', true)
on conflict (id) do nothing;
create policy "course images admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-images' and is_admin());
create policy "course images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-images' and is_admin());
create policy "course images read" on storage.objects for select
  using (bucket_id = 'course-images');
