-- ============ QR 게스트 접속 방문자 카운팅 ============
-- 게스트(비회원)는 auth.uid()가 없으므로 visit_logs에 브라우저 단위 guest_id로 기록한다.
-- (guest_id, 날짜) 기준 하루 1회만 집계되며, 기존 방문자 통계(record_visit/visit_stats/visit_series)는
-- visit_logs 행 수를 세므로 게스트 방문도 자동으로 합산된다.

alter table public.visit_logs alter column user_id drop not null;
alter table public.visit_logs add column if not exists guest_id text;
alter table public.visit_logs
  add constraint visit_logs_actor_check check (user_id is not null or guest_id is not null);
create unique index if not exists visit_logs_guest_daily
  on public.visit_logs (guest_id, visited_date) where guest_id is not null;

-- 게스트: 방문 기록 (게시판 게스트 토큰으로 검증)
create or replace function public.guest_record_visit(p_token text, p_guest_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gid text := trim(coalesce(p_guest_id, ''));
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_gid = '' or length(v_gid) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_guest_id');
  end if;
  insert into public.visit_logs (user_id, guest_id, visited_date)
  values (null, v_gid, (now() at time zone 'Asia/Seoul')::date)
  on conflict (guest_id, visited_date) where guest_id is not null do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.guest_record_visit(text, text) from public;
grant execute on function public.guest_record_visit(text, text) to anon, authenticated;
