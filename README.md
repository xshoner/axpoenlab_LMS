# AX오픈랩 LMS

기수(Cohort) 기반 AI 교육 운영 LMS. 강좌 열람·과제 제출·설문·퀴즈·공지·문의·만족도 평가를 하나의 화면에서 운영합니다.

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | React 18 + Vite (멀티페이지: `index.html` 학습자 / `admin.html` 관리자) |
| 백엔드/DB/인증/스토리지 | Supabase (PostgreSQL + RLS, Auth, Storage, Edge Functions) |
| 차트 | Recharts |
| 배포 | Vercel (정적 빌드) + GitHub Actions CI |

## 구조

```
index.html / admin.html      # 학습자 / 관리자 진입점
src/
  lib/                       # supabase 클라이언트, 헬퍼
  styles/tokens.css          # design.md 디자인 토큰 (강좌 카드 컬러 테마, 별점, 메모 보드 포함)
  shared/                    # 공용 UI (Toast, Dialog, StarRating, VisitorCounter, Footer, Aurora, RichEditor)
  student/                   # 학습자 앱 (대시보드·히트맵, 강좌+만족도 별점, 과제, 설문, 퀴즈, 공지, 문의)
  admin/                     # 관리자 앱 (대시보드+공지/메모보드, 기수, 강좌+평균 별점, 설문/퀴즈 빌더·통계 등)
supabase/
  migrations/                # 전체 스키마·RLS·RPC·Storage 정책 (버전 관리)
  tests/rls_smoke_test.sql   # RLS 권한 경계 스모크 테스트
  functions/                 # Edge Functions 소스 (signup, admin-users)
.github/workflows/ci.yml     # lint + build CI
```

## 개발

```bash
npm install
npm run dev      # http://localhost:5173 (관리자: /admin.html)
npm run lint     # ESLint (react-hooks 규칙 포함)
npm run build    # dist/
```

## 환경 변수

Supabase URL과 publishable key는 클라이언트 공개가 허용된 값으로 `src/lib/supabase.js`에 기본값이 있으며,
`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 환경 변수로 재정의할 수 있습니다.

⚠️ **service_role key는 절대 클라이언트/저장소에 포함하지 않습니다.** 관리자 계정 생성·비밀번호 초기화 등
권한이 필요한 작업은 Supabase Edge Functions(`signup`, `admin-users`)에서 서버측 role 검증 후 수행합니다.

## 데이터베이스

스키마·RLS 정책·RPC·Storage 정책의 전체 SQL이 **`supabase/migrations/`에 버전 관리**됩니다.
새 환경 복구는 `supabase db push`(또는 마이그레이션 순차 실행)로 가능합니다.

| 마이그레이션 | 내용 |
|---|---|
| `lms_core_schema` | 테이블 전체 (profiles, cohorts, 강좌 마스터/스냅샷, 설문, 퀴즈, 공지, 문의, 방문 로그 등) |
| `lms_rls_policies` | 역할 기반 RLS (학습자는 자기 기수·자기 데이터만, 관리자 role 서버 검증) |
| `lms_views_rpcs` | 학생용 퀴즈 문항 뷰(정답 차단), 방문 통계, 스냅샷 복제, 자동채점 RPC |
| `lms_storage` | Storage 버킷(course-files 50MB, submissions 5MB 등) + 접근 정책 |
| `grade_quiz_choice_anyof` | 선다형 복수 인정 정답 채점 |
| `nickname_board_course_images` | 관리자 닉네임, 공개게시판, 본문 이미지 버킷 |
| `lms_ratings_memos_tx_rpcs` | 강좌 만족도 별점, 관리자 메모 게시판, 설문·퀴즈 트랜잭션 저장/제출 RPC |
| `bookmarks_push_messages_hackathon_fields` | 사용자별 AI 사이트 북마크, 관리자→학생 푸시 쪽지(이력·발송 기록, Realtime), 해커톤 주요 AI/프롬프트/Repo 항목 |

핵심 보안 설계:
- 퀴즈 정답(`quiz_questions.answer`)은 학습자 RLS에서 완전 차단, 마감·채점 후 `quiz_questions_student` 뷰를 통해서만 노출
- 자동채점은 `grade_quiz()` SECURITY DEFINER RPC (관리자 검증 후 서버에서 일괄 실행)
- 설문·퀴즈의 **저장/제출은 단일 DB 함수(`save_survey`, `save_quiz`, `submit_survey`, `submit_quiz`)에서
  트랜잭션으로 처리** — 중간 실패로 문항·답안이 유실되지 않으며, 퀴즈 중복 제출은 서버에서 멱등 처리
- 만족도 별점은 `rate_course()` RPC로 upsert, 집계는 `course_rating_stats` 뷰(관리자 전체 / 학생은 자기 기수만)
- RLS 권한 경계는 `supabase/tests/rls_smoke_test.sql`로 검증 가능

### Storage 공개 범위

| 버킷 | 공개 여부 | 용도 |
|---|---|---|
| `course-files`, `notice-files`, `submissions`, `inquiry-files` | **비공개** (서명 URL) | 강좌 자료·과제·문의 파일 |
| `course-images` | **공개 (의도적)** | 강좌 본문 삽입 이미지 전용. 업로드/삭제는 관리자만 가능하며 개인정보성 파일 저장 금지 |

## 주요 기능 (최근 추가)

- **쪽지 링크 버튼**: 쪽지에 URL + 버튼명(예: "Gemini 열기")을 붙여 학생 팝업·쪽지함에서 바로 이동
- **본문 복사 블록**: RichEditor의 명령어/프롬프트 블록 → 학생 화면에서 [복사]/[프롬프트 복사] 버튼 한 번으로 클립보드 복사 (`RichBody`)
- **해커톤 URL 일괄 점검**: 관리자·학생 목록에 URL 연결 상태(🟢 정상/🔴 오류) 컬럼, 관리자 "전체 URL 다시 검사" + 정상/오류 집계
- **자동 임시저장**: 해커톤 등록·게시판·1:1 문의·과제 URL·강좌/공지/설문/퀴즈 작성 폼을 localStorage에 저장("임시저장됨 · 18:37"), 재진입 시 복원, 이탈 시 경고
- **학생 화면 미리보기**: 관리자 상단 버튼 → 선택 기수 학생에게 보이는 강좌·설문·퀴즈·과제를 학생 레이아웃으로 확인(초안 항목은 비공개 표시)
- **AI 사이트 북마크 바**: 학생·관리자 대시보드 공지사항 위에 로고+명칭 한 줄 배치, `+` 버튼으로 추가/수정/삭제 (사용자별 저장)
- **관리자 → 학생 쪽지 푸시**: 관리자 상단 `쪽지` 버튼에서 작성·보내기 → 접속 중인 해당 기수 학생 화면에 팝업 강제 표시(Realtime). 보낸 이력 재발송/수정/삭제, 학생 상단 `쪽지 N건` 쪽지함
- **학생 상단 접속자 수** 표시, **해커톤 등록** 항목 추가(주로 사용한 AI, 프롬프트, Github Repo) + 웹앱 URL 연결 상태 표시(정상/이상)

- **강좌 만족도 별점 (5점 만점)**: 학생이 강좌 상세 하단에서 평가·수정. 관리자 강좌 카드에는 기수별 평균,
  슈퍼관리자 마스터 강좌 라이브러리에는 전 기수 가중 평균이 표시됩니다.
- **관리자 대시보드**: 공지사항 요약 + 관리자 전용 메모 게시판(클릭 즉시 작성/수정/삭제),
  만족도 상위 강좌 TOP 5
- **본문 편집기 URL 미리보기**: URL 붙여넣기/링크 삽입 시 400×300 썸네일 카드 자동 삽입
- **강좌 카드 컬러 테마**: 강좌 번호 기반 6색 순환 테마

## CI / 배포

- GitHub Actions: push/PR 시 `npm run lint` + `npm run build`
- Vercel: 정적 빌드 배포 (프로젝트 `lms-axopenlab`)

## 라이선스

Produced by AXopenLab / xshoner@gmail.com
