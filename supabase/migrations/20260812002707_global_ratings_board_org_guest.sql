-- ============ 1) 강좌 별점: 기수별 → 전 기수 통합 평균 ============
-- 같은 마스터 강좌에서 파생된 모든 기수 강좌의 별점을 합산해 하나의 평균으로 집계한다.
-- 마스터 없이 만든 단독 강좌는 기존처럼 자기 강좌 별점만 집계한다.
-- 뷰 컬럼 구조는 기존과 동일 (cohort_course_id 단위 행) — 프런트 쿼리 호환 유지.
drop view if exists public.course_rating_stats;
create view public.course_rating_stats
with (security_barrier = true, security_invoker = false) as
with agg as (
  select
    coalesce(cc.master_course_id::text, cc.id::text) as group_key,
    count(r.id)::int as rating_count,
    round(avg(r.rating)::numeric, 2) as avg_rating
  from public.cohort_courses cc
  join public.course_ratings r on r.cohort_course_id = cc.id
  group by 1
)
select
  cc.id as cohort_course_id,
  cc.cohort_id,
  cc.master_course_id,
  a.rating_count,
  a.avg_rating
from public.cohort_courses cc
join agg a on a.group_key = coalesce(cc.master_course_id::text, cc.id::text)
where public.is_admin() or cc.cohort_id = public.my_cohort_id();
grant select on public.course_rating_stats to authenticated;

-- ============ 2) 공개게시판: 작성자 소속 + 게스트 글 ============
alter table public.board_posts
  add column if not exists author_org text not null default '',
  add column if not exists is_guest boolean not null default false;
-- 게스트 글은 회원 계정이 없으므로 user_id를 비울 수 있어야 한다
alter table public.board_posts alter column user_id drop not null;
alter table public.board_comments
  add column if not exists author_org text not null default '';

-- 기존 글·댓글에 작성자 소속 백필
update public.board_posts p set author_org = pr.org
  from public.profiles pr where pr.id = p.user_id and p.author_org = '';
update public.board_comments c set author_org = pr.org
  from public.profiles pr where pr.id = c.user_id and c.author_org = '';

-- ============ 3) QR 게스트 접속 토큰 + 게스트 전용 RPC ============
-- 토큰은 system_settings('board_guest_token')에 저장. QR/링크에 포함되어 게스트 접근을 게이트한다.

-- 내부 전용 토큰 검증 (API role 직접 호출 불가 — definer RPC 내부에서만 사용)
create or replace function public.board_guest_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_token, '') <> '' and exists (
    select 1 from public.system_settings
    where key = 'board_guest_token' and value = to_jsonb(p_token));
$$;
revoke execute on function public.board_guest_token_ok(text) from anon, authenticated, public;

-- 관리자: 토큰 발급/재발급 (settings write RLS는 super_admin 전용이므로 definer로 우회)
create or replace function public.rotate_board_guest_token() returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.system_settings (key, value)
  values ('board_guest_token', to_jsonb(v_token))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_token;
end $$;
revoke execute on function public.rotate_board_guest_token() from anon, public;

-- 게스트: 게시글 목록
create or replace function public.guest_board_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'author_name', p.author_name,
      'author_org', p.author_org, 'is_guest', p.is_guest, 'created_at', p.created_at,
      'comment_count', (select count(*)::int from public.board_comments c where c.post_id = p.id)
    ) order by p.created_at desc)
    from public.board_posts p), '[]'::jsonb));
end $$;
revoke execute on function public.guest_board_list(text) from public;
grant execute on function public.guest_board_list(text) to anon, authenticated;

-- 게스트: 게시글 상세 + 댓글 (읽기 전용)
create or replace function public.guest_board_get(p_token text, p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_post jsonb;
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'author_name', p.author_name,
    'author_org', p.author_org, 'is_guest', p.is_guest, 'created_at', p.created_at)
  into v_post from public.board_posts p where p.id = p_post_id;
  if v_post is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'post', v_post, 'comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'author_name', c.author_name, 'author_org', c.author_org,
      'body', c.body, 'created_at', c.created_at
    ) order by c.created_at)
    from public.board_comments c where c.post_id = p_post_id), '[]'::jsonb));
end $$;
revoke execute on function public.guest_board_get(text, uuid) from public;
grant execute on function public.guest_board_get(text, uuid) to anon, authenticated;

-- 게스트: 글 작성 (소속·작성자·제목·내용 필수)
create or replace function public.guest_board_create_post(
  p_token text, p_org text, p_author text, p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org text := trim(coalesce(p_org, ''));
  v_author text := trim(coalesce(p_author, ''));
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_org = '' or v_author = '' or v_title = '' or v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if length(v_org) > 40 or length(v_author) > 40 or length(v_title) > 120 or length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  insert into public.board_posts (user_id, author_name, author_org, title, body, is_guest)
  values (null, v_author, v_org, v_title, v_body, true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.guest_board_create_post(text, text, text, text, text) from public;
grant execute on function public.guest_board_create_post(text, text, text, text, text) to anon, authenticated;
