-- ============ RPC 실행 권한 강화 (Supabase security advisor 대응) ============
-- 트리거 전용 함수는 API(role)에서 직접 실행 불가 — 트리거 실행에는 EXECUTE 권한이 불필요
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.guard_profile_update() from anon, authenticated, public;
revoke execute on function public.log_submission() from anon, authenticated, public;

-- 액션 RPC는 로그인 사용자 전용 (anon 차단).
-- is_admin/is_super_admin/my_cohort_id/current_role_of는 RLS 정책 내부에서
-- 익명 요청 평가 시에도 호출되므로 anon 실행을 유지한다 (false/null 반환으로 무해).
revoke execute on function public.assign_member(uuid, uuid) from anon, public;
revoke execute on function public.grade_quiz(uuid) from anon, public;
revoke execute on function public.increment_notice_view(uuid) from anon, public;
revoke execute on function public.join_cohort_by_code(text) from anon, public;
revoke execute on function public.rate_course(uuid, int) from anon, public;
revoke execute on function public.record_course_view(uuid) from anon, public;
revoke execute on function public.record_visit() from anon, public;
revoke execute on function public.save_quiz(uuid, jsonb, jsonb) from anon, public;
revoke execute on function public.save_survey(uuid, jsonb, jsonb) from anon, public;
revoke execute on function public.snapshot_courses_to_cohort(uuid, uuid[]) from anon, public;
revoke execute on function public.submit_quiz(uuid, jsonb) from anon, public;
revoke execute on function public.submit_survey(uuid, jsonb) from anon, public;
revoke execute on function public.visit_series(int) from anon, public;
revoke execute on function public.visit_stats() from anon, public;
