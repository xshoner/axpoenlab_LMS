-- ============ 바이브 해커톤 + 명예의 전당 ============

-- 1) 해커톤 결과물 (기수당 학생 1건)
create table public.hackathon_entries (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  summary text not null default '',
  url text,
  author_name text not null default '',
  author_org text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, user_id)
);

create table public.hackathon_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.hackathon_entries(id) on delete cascade,
  file_path text not null,
  filename text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

-- 2) 별점 (1~5, 결과물당 학생 1개, 본인 결과물 평가 불가 — RPC에서 강제)
create table public.hackathon_ratings (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.hackathon_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, user_id)
);

-- 3) 기수별 해커톤 라운드 상태 (마감 여부)
create table public.hackathon_rounds (
  cohort_id uuid primary key references public.cohorts(id) on delete cascade,
  closed boolean not null default false,
  closed_at timestamptz
);

-- 4) 명예의 전당 (마감 시 TOP3 스냅샷 자동 이관 — 원본 수정·삭제와 무관하게 보존)
create table public.hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  entry_id uuid references public.hackathon_entries(id) on delete set null,
  rank int not null check (rank between 1 and 3),
  title text not null,
  summary text not null default '',
  url text,
  author_name text not null default '',
  author_org text not null default '',
  avg_rating numeric not null default 0,
  rating_count int not null default 0,
  cohort_name text not null default '',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (cohort_id, rank)
);

alter table public.hackathon_entries enable row level security;
alter table public.hackathon_attachments enable row level security;
alter table public.hackathon_ratings enable row level security;
alter table public.hackathon_rounds enable row level security;
alter table public.hall_of_fame enable row level security;

-- ============ RLS ============
-- 결과물: 같은 기수 학생 열람, 본인 작성(마감 전), 본인·관리자 수정/삭제(마감 후에도 가능)
create policy "hackathon entry select" on public.hackathon_entries for select
  using (public.is_admin() or cohort_id = public.my_cohort_id());
create policy "hackathon entry insert" on public.hackathon_entries for insert
  with check (
    user_id = auth.uid()
    and cohort_id = public.my_cohort_id()
    and not exists (select 1 from public.hackathon_rounds hr
                    where hr.cohort_id = public.my_cohort_id() and hr.closed));
create policy "hackathon entry update" on public.hackathon_entries for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "hackathon entry delete" on public.hackathon_entries for delete
  using (user_id = auth.uid() or public.is_admin());

create policy "hackathon att select" on public.hackathon_attachments for select
  using (public.is_admin() or exists (
    select 1 from public.hackathon_entries e
    where e.id = entry_id and e.cohort_id = public.my_cohort_id()));
create policy "hackathon att insert" on public.hackathon_attachments for insert
  with check (exists (
    select 1 from public.hackathon_entries e
    where e.id = entry_id and (e.user_id = auth.uid() or public.is_admin())));
create policy "hackathon att delete" on public.hackathon_attachments for delete
  using (exists (
    select 1 from public.hackathon_entries e
    where e.id = entry_id and (e.user_id = auth.uid() or public.is_admin())));

-- 별점: 본인 것만 직접 조회 (통계는 뷰, 쓰기는 RPC 전용)
create policy "hackathon rating select" on public.hackathon_ratings for select
  using (user_id = auth.uid() or public.is_admin());

-- 라운드 상태: 자기 기수 열람, 관리자 쓰기
create policy "hackathon round select" on public.hackathon_rounds for select
  using (public.is_admin() or cohort_id = public.my_cohort_id());
create policy "hackathon round write" on public.hackathon_rounds for all
  using (public.is_admin()) with check (public.is_admin());

-- 명예의 전당: 전체 로그인 사용자 열람, 관리자만 쓰기 (학생은 자기 글도 수정·삭제 불가)
create policy "hall select" on public.hall_of_fame for select
  using (auth.uid() is not null);
create policy "hall admin write" on public.hall_of_fame for all
  using (public.is_admin()) with check (public.is_admin());

-- ============ 별점 통계 뷰 (같은 기수 + 관리자) ============
create view public.hackathon_rating_stats
with (security_barrier = true, security_invoker = false) as
select
  e.id as entry_id,
  e.cohort_id,
  count(r.id)::int as rating_count,
  round(avg(r.rating)::numeric, 2) as avg_rating
from public.hackathon_entries e
join public.hackathon_ratings r on r.entry_id = e.id
where public.is_admin() or e.cohort_id = public.my_cohort_id()
group by e.id;
grant select on public.hackathon_rating_stats to authenticated;

-- ============ RPC ============
-- 별점 등록/수정 (같은 기수 + 타인 결과물 + 마감 전)
create or replace function public.rate_hackathon(p_entry_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_entry public.hackathon_entries;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  select e.* into v_entry from public.hackathon_entries e
  join public.cohort_members m on m.cohort_id = e.cohort_id and m.user_id = auth.uid()
  where e.id = p_entry_id;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_entry.user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'own_entry');
  end if;
  if exists (select 1 from public.hackathon_rounds hr
             where hr.cohort_id = v_entry.cohort_id and hr.closed) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  insert into public.hackathon_ratings (entry_id, user_id, rating)
  values (p_entry_id, auth.uid(), p_rating)
  on conflict (entry_id, user_id)
  do update set rating = excluded.rating, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.rate_hackathon(uuid, int) from anon, public;

-- 해커톤 마감: 라운드 잠금 + TOP3 명예의 전당 스냅샷 이관 (재실행 시 해당 기수 재생성)
create or replace function public.close_hackathon(p_cohort_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.hackathon_rounds (cohort_id, closed, closed_at)
  values (p_cohort_id, true, now())
  on conflict (cohort_id) do update set closed = true, closed_at = now();
  delete from public.hall_of_fame where cohort_id = p_cohort_id;
  insert into public.hall_of_fame
    (cohort_id, entry_id, rank, title, summary, url, author_name, author_org,
     avg_rating, rating_count, cohort_name, attachments)
  select
    e.cohort_id, e.id,
    row_number() over (order by avg(r.rating) desc, count(r.id) desc, e.created_at asc),
    e.title, e.summary, e.url, e.author_name, e.author_org,
    round(avg(r.rating)::numeric, 2), count(r.id)::int,
    (select c.name from public.cohorts c where c.id = e.cohort_id),
    coalesce((select jsonb_agg(jsonb_build_object(
        'file_path', a.file_path, 'filename', a.filename, 'file_size', a.file_size))
      from public.hackathon_attachments a where a.entry_id = e.id), '[]'::jsonb)
  from public.hackathon_entries e
  join public.hackathon_ratings r on r.entry_id = e.id
  where e.cohort_id = p_cohort_id
  group by e.id
  order by avg(r.rating) desc, count(r.id) desc, e.created_at asc
  limit 3;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'top_count', v_count);
end $$;
revoke execute on function public.close_hackathon(uuid) from anon, public;

-- 마감 해제: 라운드 재개 + 해당 기수 명예의 전당 회수
create or replace function public.reopen_hackathon(p_cohort_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.hackathon_rounds set closed = false, closed_at = null
  where cohort_id = p_cohort_id;
  delete from public.hall_of_fame where cohort_id = p_cohort_id;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.reopen_hackathon(uuid) from anon, public;

-- ============ Storage: 해커톤 첨부 파일 ============
-- 읽기: 로그인 사용자 전체 (명예의 전당이 전 기수 공개이므로), 쓰기: 본인 폴더, 삭제: 본인·관리자
insert into storage.buckets (id, name, public, file_size_limit)
values ('hackathon-files', 'hackathon-files', false, 52428800)
on conflict (id) do nothing;
create policy "hackathon files read" on storage.objects for select
  using (bucket_id = 'hackathon-files' and auth.uid() is not null);
create policy "hackathon files insert" on storage.objects for insert
  with check (bucket_id = 'hackathon-files'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hackathon files delete" on storage.objects for delete
  using (bucket_id = 'hackathon-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
