-- ============ RLS / RPC 스모크 테스트 ============
-- 전체가 하나의 트랜잭션이며 마지막에 rollback 되므로 실데이터에 영향이 없습니다.
-- 실행: psql(또는 Supabase SQL Editor)에서 통째로 실행. 2026-08-09 라이브 DB 통과 확인.
begin;

-- 테스트 픽스처
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'student-b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.local');

-- guard_profile_update 트리거는 익명 role 변경을 막으므로 픽스처 구성 시에만 잠시 해제
alter table public.profiles disable trigger guard_profile_update;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';
alter table public.profiles enable trigger guard_profile_update;

insert into public.cohorts (id, name, code) values
  ('10000000-0000-0000-0000-000000000001', '테스트1기', 'T1'),
  ('10000000-0000-0000-0000-000000000002', '테스트2기', 'T2');

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
  -- 자기 기수의 테스트 강좌만 보인다
  if (select count(*) from public.cohort_courses
      where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')) <> 1 then
    raise exception 'FAIL: student should see only own-cohort test course';
  end if;
  -- 퀴즈 정답 원본 테이블 접근 차단
  if exists (select 1 from public.quiz_questions) then
    raise exception 'FAIL: student must not read quiz_questions directly';
  end if;
  -- 타 기수 강좌에 별점 불가
  if (public.rate_course('20000000-0000-0000-0000-000000000002', 5)->>'ok')::boolean then
    raise exception 'FAIL: rating another cohort course must be rejected';
  end if;
  -- 자기 기수 강좌 별점 성공
  if not (public.rate_course('20000000-0000-0000-0000-000000000001', 4)->>'ok')::boolean then
    raise exception 'FAIL: rating own cohort course should succeed';
  end if;
  -- 관리자 메모 접근 차단
  if exists (select 1 from public.admin_memos) then
    raise exception 'FAIL: student must not read admin_memos';
  end if;
end $$;

-- ---------- 관리자 관점 ----------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare v_sid uuid; v_qcount int;
begin
  if (select count(*) from public.cohort_courses
      where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')) <> 2 then
    raise exception 'FAIL: admin should see both test courses';
  end if;
  if (select count(*) from public.course_rating_stats
      where cohort_course_id = '20000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: admin should see rating stats for the rated test course';
  end if;
  if (select avg_rating from public.course_rating_stats
      where cohort_course_id = '20000000-0000-0000-0000-000000000001') <> 4.00 then
    raise exception 'FAIL: avg rating should be 4.00';
  end if;
  insert into public.admin_memos (author_id, body) values ('00000000-0000-0000-0000-00000000000c', '테스트 메모');
  -- 설문 트랜잭션 저장 검증 (신규 → 문항 2개)
  v_sid := public.save_survey(null,
    '{"cohort_course_id":"20000000-0000-0000-0000-000000000001","title":"만족도 설문","allow_edit":true}'::jsonb,
    '[{"type":"choice","text":"Q1","options":["a","b"],"required":true},{"type":"short","text":"Q2"}]'::jsonb);
  select count(*) into v_qcount from public.survey_questions where survey_id = v_sid;
  if v_qcount <> 2 then raise exception 'FAIL: save_survey should insert 2 questions'; end if;
  -- 재저장 시 문항 원자적 교체 (2개 → 1개)
  v_sid := public.save_survey(v_sid,
    '{"cohort_course_id":"20000000-0000-0000-0000-000000000001","title":"만족도 설문 v2","allow_edit":false}'::jsonb,
    '[{"type":"long","text":"Q1 only"}]'::jsonb);
  select count(*) into v_qcount from public.survey_questions where survey_id = v_sid;
  if v_qcount <> 1 then raise exception 'FAIL: save_survey should replace questions atomically'; end if;
end $$;

select 'ALL RLS/RPC SMOKE TESTS PASSED' as result;
rollback;
