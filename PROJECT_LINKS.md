# PROJECT_LINKS.md — AX오픈랩 LMS 필수 연결 정보

> 다른 장소/PC에서 작업할 때 반드시 이 문서를 먼저 확인하세요.
> 마지막 검증: 2026-08-09 (실제 배포로 전 항목 확인 완료)

## 1. GitHub (소스 저장소)

| 항목 | 값 |
|---|---|
| 저장소 | `https://github.com/xshoner/axpoenlab_LMS` |
| 기본 브랜치 | `main` (배포 기준 브랜치) |
| 계정 | `xshoner` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — push/PR 시 lint + build |

```bash
git clone https://github.com/xshoner/axpoenlab_LMS.git
cd axpoenlab_LMS && npm install
```

⚠️ 주의
- `node_modules/`, `dist/`, `.vercel/`, `.env*`, `.bkit/`은 `.gitignore`로 제외됨 — GitHub에 없는 것이 정상.
- 커밋 전 `npm run lint && npm run build`로 확인.

## 2. Vercel (프론트엔드 배포)

| 항목 | 값 |
|---|---|
| 프로젝트명 | `lms-axopenlab` |
| Project ID | `prj_ZjibI3jcyRc2Y0C236h4d4a7wB8z` |
| Org ID | `team_qyl03XzqdOia1gxvLOgQ1l3Z` |
| 계정(스코프) | `xshoner-3375` (개인 계정) |
| 프로덕션 URL | `https://lms-axopenlab.vercel.app` (관리자: `/admin.html`) |
| 대시보드 | `https://vercel.com/xshoner-3375s-projects/lms-axopenlab` |

**⚠️ 가장 헷갈리기 쉬운 부분 — 배포 방식은 CLI 수동 배포입니다.**
- 이 프로젝트는 **GitHub 자동 배포 연동이 안 되어 있음** → `git push`만으로는 배포되지 않는다.
- claude.ai의 Vercel 커넥터(MCP)는 "AX Open Lab" 팀 스코프만 접근 가능 → 이 프로젝트(개인 계정 소속)에는 403. **반드시 로컬 Vercel CLI 사용.**

새 PC에서 배포 절차:
```bash
npx vercel login                                # xshoner-3375 계정으로 1회 로그인
npx vercel link --yes --project lms-axopenlab   # .vercel/project.json 생성
npx vercel deploy --prod                        # 프로덕션 배포 (빌드 1~5분)
```
- `--scope xshoner-3375` 옵션은 넣지 말 것 (개인 계정은 scope 지정 불가 에러 발생).
- 배포 성공 확인: `https://lms-axopenlab.vercel.app`에서 에셋 해시 변경 확인 (캐시 주의, Ctrl+Shift+R).

## 3. Supabase (백엔드/DB/인증/스토리지)

| 항목 | 값 |
|---|---|
| Project Ref | `ugelgndotyppgksbubot` |
| URL | `https://ugelgndotyppgksbubot.supabase.co` |
| 클라이언트 키 | publishable key — `src/lib/supabase.js`에 기본값 있음 (공개 허용 키) |
| 대시보드 | `https://supabase.com/dashboard/project/ugelgndotyppgksbubot` |
| 마이그레이션 | `supabase/migrations/` (17개, 원격과 동기화 상태 — 2026-08-30) |
| RLS 테스트 | `supabase/tests/rls_smoke_test.sql` (트랜잭션+롤백, 실데이터 무영향) |
| Edge Functions | `supabase/functions/` — `signup`, `admin-users` |

⚠️ 주의
- **service_role key는 절대 코드/저장소에 넣지 않는다.** 권한 작업은 Edge Function에서만.
- 스키마 변경 시 반드시 ① 원격에 마이그레이션 적용 + ② 같은 SQL을 `supabase/migrations/`에 커밋 (두 곳 동기화 유지).
- Storage 버킷: `course-images`만 의도적 공개(본문 이미지 전용), 나머지는 전부 비공개 + 서명 URL.
- 슈퍼관리자 계정: `xshoner@gmail.com` (가입 트리거에서 자동 super_admin 부여).

## 4. 로컬 개발

```bash
npm run dev      # http://localhost:5173 (관리자: /admin.html)
npm run lint     # ESLint
npm run build    # dist/ 생성
```
- 멀티페이지(Vite): `index.html`(학습자) + `admin.html`(관리자), 라우팅은 HashRouter → 서버 rewrites 불필요.

## 5. 외부 서비스 의존성

| 서비스 | 용도 | 비고 |
|---|---|---|
| WordPress mshots (`s.wordpress.com/mshots/v1/...`) | 편집기 URL 썸네일 (400×300) | 무료·무키. 첫 요청 시 로딩 GIF로 307 → 에디터가 준비 감지 후 자동 갱신 |
| Pretendard CDN (jsdelivr) | 웹폰트 | `index.html`/`admin.html`에서 로드 |
