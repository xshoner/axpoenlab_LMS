-- ============ 해커톤 한줄평 + 관리자 별점 허용 ============

-- 1) 한줄평 (결과물당 여러 건, 본인 작성분만 삭제 가능)
create table public.hackathon_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.hackathon_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index hackathon_comments_entry_idx on public.hackathon_comments (entry_id, created_at);
alter table public.hackathon_comments enable row level security;

create policy "hackathon comment select" on public.hackathon_comments for select
  using (public.is_admin() or exists (
    select 1 from public.hackathon_entries e
    where e.id = entry_id and e.cohort_id = public.my_cohort_id()));
create policy "hackathon comment insert" on public.hackathon_comments for insert
  with check (user_id = auth.uid() and (public.is_admin() or exists (
    select 1 from public.hackathon_entries e
    where e.id = entry_id and e.cohort_id = public.my_cohort_id())));
create policy "hackathon comment delete own" on public.hackathon_comments for delete
  using (user_id = auth.uid());

-- 2) 별점: 관리자도 평가 가능 (기수 소속 조건을 관리자에게는 면제, 마감·본인 결과물 제한은 동일)
create or replace function public.rate_hackathon(p_entry_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_entry public.hackathon_entries;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  if public.is_admin() then
    select e.* into v_entry from public.hackathon_entries e where e.id = p_entry_id;
  else
    select e.* into v_entry from public.hackathon_entries e
    join public.cohort_members m on m.cohort_id = e.cohort_id and m.user_id = auth.uid()
    where e.id = p_entry_id;
  end if;
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
