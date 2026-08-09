-- ============ RLS 스모크 테스트 ============
-- 실행: supabase db reset 후 psql로 실행하거나, CI에서 supabase test db 로 실행합니다.
-- 익명(anon) / 학생 / 타 기수 학생 / 관리자 관점에서 핵심 권한 경계를 검증합니다.
begin;

-- 테스트 픽스처
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'student-b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.local')
on conflict do nothing;

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';

insert into public.cohorts (id, name, code) values
  ('10000000-0000-0000-0000-000000000001', '1기', 'C1'),
  ('10000000-0000-0000-0000-000000000002', '2기', 'C2');

insert into public.cohort_members (cohort_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b');

insert into public.cohort_courses (id, cohort_id, course_no, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '1기 강좌'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 1, '2기 강좌');

-- ---------- 학생 A 관점 ----------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  -- 자기 기수 강좌만 보인다
  if (select count(*) from public.cohort_courses) <> 1 then
    raise exception 'FAIL: student should see exactly 1 course (own cohort)';
  end if;
  -- 퀴즈 정답 원본 테이블 접근 차단
  if exists (select 1 from public.quiz_questions) then
    raise exception 'FAIL: student must not read quiz_questions directly';
  end if;
  -- 타 기수 강좌에 별점 불가 (RPC가 not_member 반환)
  if (public.rate_course('20000000-0000-0000-0000-000000000002', 5)->>'ok')::boolean then
    raise exception 'FAIL: rating another cohort''s course must be rejected';
  end if;
  -- 자기 기수 강좌 별점 성공
  if not (public.rate_course('20000000-0000-0000-0000-000000000001', 4)->>'ok')::boolean then
    raise exception 'FAIL: rating own cohort course should succeed';
  end if;
  -- 관리자 메모 접근 차단
  if exists (select 1 from public.admin_memos) then
    raise exception 'FAIL: student must not read admin_memos';
  end if;
  raise notice 'PASS: student A boundary checks';
end $$;

-- ---------- 관리자 관점 ----------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
begin
  if (select count(*) from public.cohort_courses) <> 2 then
    raise exception 'FAIL: admin should see all courses';
  end if;
  if (select count(*) from public.course_rating_stats) <> 1 then
    raise exception 'FAIL: admin should see rating stats';
  end if;
  insert into public.admin_memos (author_id, body)
  values ('00000000-0000-0000-0000-00000000000c', '테스트 메모');
  raise notice 'PASS: admin boundary checks';
end $$;

rollback;
