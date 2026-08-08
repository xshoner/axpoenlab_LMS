# AX오픈랩 LMS

기수(Cohort) 기반 AI 교육 운영 LMS. 강좌 열람·과제 제출·설문·퀴즈·공지·문의를 하나의 화면에서 운영합니다.

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | React 18 + Vite (멀티페이지: `index.html` 학습자 / `admin.html` 관리자) |
| 백엔드/DB/인증/스토리지 | Supabase (PostgreSQL + RLS, Auth, Storage, Edge Functions) |
| 차트 | Recharts |
| 배포 | Vercel (정적 빌드) |

## 구조

```
index.html / admin.html      # 학습자 / 관리자 진입점
src/
  lib/                       # supabase 클라이언트, 헬퍼
  styles/tokens.css          # design.md 디자인 토큰
  shared/                    # 공용 UI (Toast, Dialog, VisitorCounter, Footer, Aurora, RichEditor)
  student/                   # 학습자 앱 (대시보드·히트맵, 강좌, 과제, 설문, 퀴즈, 공지, 문의)
  admin/                     # 관리자 앱 (대시보드, 기수, 강좌, 과제 매트릭스, 설문/퀴즈 빌더·통계, 회원, 문의, 슈퍼관리자 메뉴)
supabase/functions/          # Edge Functions 소스 (signup, admin-users)
```

## 개발

```bash
npm install
npm run dev      # http://localhost:5173 (관리자: /admin.html)
npm run build    # dist/
```

## 환경 변수

Supabase URL과 publishable key는 클라이언트 공개가 허용된 값으로 `src/lib/supabase.js`에 기본값이 있으며,
`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 환경 변수로 재정의할 수 있습니다.

⚠️ **service_role key는 절대 클라이언트/저장소에 포함하지 않습니다.** 관리자 계정 생성·비밀번호 초기화 등
권한이 필요한 작업은 Supabase Edge Functions(`signup`, `admin-users`)에서 서버측 role 검증 후 수행합니다.

## 데이터베이스

스키마·RLS 정책·RPC는 Supabase Migration으로 버전 관리되어 적용되어 있습니다:

- `lms_core_schema` — 테이블 전체 (profiles, cohorts, 강좌 마스터/스냅샷, 설문, 퀴즈, 공지, 문의, 방문 로그 등)
- `lms_rls_policies` — 역할 기반 RLS (학습자는 자기 기수·자기 데이터만, 관리자 role 서버 검증)
- `lms_views_rpcs` — 학생용 퀴즈 문항 뷰(정답 차단), 방문 통계, 스냅샷 복제, 자동채점 RPC
- `lms_storage` — Storage 버킷(course-files 50MB, submissions 5MB 등) + 접근 정책
- `grade_quiz_choice_anyof` — 선다형 복수 인정 정답 채점

핵심 보안 설계:
- 퀴즈 정답(`quiz_questions.answer`)은 학습자 RLS에서 완전 차단, 마감·채점 후 `quiz_questions_student` 뷰를 통해서만 노출
- 자동채점은 `grade_quiz()` SECURITY DEFINER RPC (관리자 검증 후 서버에서 일괄 실행)
- Storage는 전부 비공개 버킷 + 서명 URL

## 라이선스

Produced by AXopenLab / xshoner@gmail.com
