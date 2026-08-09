-- guard_profile_update가 서버(service role) 요청까지 차단해
-- Edge Function의 관리자 role 부여가 실패하던 버그 수정.
-- service role 요청은 auth.uid()가 null이므로 가드를 통과시킨다
-- (service key는 서버 전용이라 신뢰 경계 안에 있음).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 서버측(service role / 관리 콘솔) 요청은 통과
  if auth.uid() is null then return new; end if;
  -- 일반 사용자는 자신의 role/status/email 변경 불가
  if not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email then
      raise exception 'not allowed';
    end if;
  end if;
  -- 역할 변경은 슈퍼관리자만 (일반 관리자 불가)
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'only super admin can change roles';
  end if;
  return new;
end $$;
