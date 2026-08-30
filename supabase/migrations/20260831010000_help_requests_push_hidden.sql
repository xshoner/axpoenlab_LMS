-- ============ 1) 학생 쪽지 삭제(숨김) — 발송 기록은 기수 공유이므로 사용자별 숨김으로 처리 ============
create table public.push_hidden (
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid not null references public.push_deliveries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, delivery_id)
);
alter table public.push_hidden enable row level security;
create policy "push hidden owner all" on public.push_hidden for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ 2) 도움 요청 대기열 (실시간) ============
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  student_name text not null default '',
  student_org text not null default '',
  category text not null default '기타',
  description text not null default '',
  screenshot_path text,
  status text not null default 'waiting' check (status in ('waiting','in_progress','resolved')),
  handler_name text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  resolved_at timestamptz
);
create index help_requests_status_idx on public.help_requests (status, created_at);
create index help_requests_user_idx on public.help_requests (user_id, created_at desc);
alter table public.help_requests enable row level security;

-- 학생: 자기 요청만 조회·등록·(대기 중) 취소. 관리자: 전체.
create policy "help admin all" on public.help_requests for all
  using (public.is_admin()) with check (public.is_admin());
create policy "help student select own" on public.help_requests for select
  using (user_id = auth.uid());
create policy "help student insert" on public.help_requests for insert
  with check (user_id = auth.uid() and status = 'waiting');
create policy "help student cancel waiting" on public.help_requests for delete
  using (user_id = auth.uid() and status = 'waiting');

alter publication supabase_realtime add table public.help_requests;

-- 내 대기 순번 (같은 기수 기준, 나보다 먼저 접수된 대기 건수 + 1). 다른 학생 내용은 노출하지 않는다.
create or replace function public.my_help_position() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_req public.help_requests; v_pos int;
begin
  if auth.uid() is null then return null; end if;
  select * into v_req from public.help_requests
  where user_id = auth.uid() and status in ('waiting','in_progress')
  order by created_at desc limit 1;
  if v_req.id is null then return null; end if;
  select count(*)::int + 1 into v_pos from public.help_requests h
  where h.status = 'waiting' and h.created_at < v_req.created_at
    and (h.cohort_id is not distinct from v_req.cohort_id);
  return jsonb_build_object('id', v_req.id, 'status', v_req.status, 'position', v_pos,
    'category', v_req.category, 'created_at', v_req.created_at, 'handler_name', v_req.handler_name);
end $$;
revoke execute on function public.my_help_position() from anon, public;

-- ============ 3) Storage: 도움 요청 스크린샷 (비공개, 본인 폴더 업로드, 본인·관리자 열람) ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('help-files', 'help-files', false, 10485760)
on conflict (id) do nothing;
create policy "help files read" on storage.objects for select
  using (bucket_id = 'help-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "help files insert" on storage.objects for insert
  with check (bucket_id = 'help-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "help files delete" on storage.objects for delete
  using (bucket_id = 'help-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
