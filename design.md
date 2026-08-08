---
version: 1.0
name: AXopenLab-LMS-design
description: AX오픈랩 LMS의 시각 언어 정의서. ComfoziAI 디자인 시스템(Navy `#1a3356` + Gold `#c89c4a`)을 교육 운영 도구로 번역한 시스템으로, 흰 배경 위 저채도 오로라 블롭·글래스 카드·pill 버튼을 기본 어휘로 삼는다. 골드는 성취·강조 신호(열람 완료 히트맵, 정답, KPI 하이라이트)에만 쓰이고, 네이비가 모든 구조와 CTA를 담당한다. 한국어 UI 전용 — 모든 텍스트는 `word-break: keep-all`. 컬러 이모지 사용 금지, 라인 아이콘만 사용.

colors:
  primary: "#1a3356"
  primary-hover: "#142945"
  primary-light: "#e4ecf4"
  primary-tint: "#f2f6fa"
  on-primary: "#ffffff"
  accent: "#c89c4a"
  accent-light: "#fdf4e0"
  accent-deep: "#a67d33"
  accent-wash: "rgba(200,156,74,0.35)"
  background: "#ffffff"
  surface: "#f6f4f0"
  surface-sunken: "#efece6"
  glass-top: "rgba(255,255,255,0.74)"
  glass-bottom: "rgba(255,255,255,0.44)"
  foreground: "#0f1419"
  muted: "#475467"
  muted-soft: "#71717a"
  border: "#e2dfd9"
  border-soft: "rgba(228,228,231,0.7)"
  link: "#1a3356"
  link-visited: "#142945"
  success: "#059669"
  success-wash: "#d1fae5"
  warning: "#d97706"
  warning-wash: "#fef3c7"
  danger: "#dc2626"
  danger-wash: "#fee2e2"
  neutral-wash: "rgba(26,51,86,0.08)"
  aurora-blue: "rgba(91,140,255,1)"
  aurora-gold: "rgba(200,156,74,1)"
  aurora-violet: "rgba(139,92,246,1)"
  chart-1: "#1a3356"
  chart-2: "#c89c4a"
  chart-3: "#5b8cff"
  chart-4: "#8b5cf6"
  chart-5: "#7d90a8"
  heat-0: "#f6f4f0"
  heat-1: "#fdf4e0"
  heat-2: "#f0dcae"
  heat-3: "#dcb96f"
  heat-4: "#c89c4a"

typography:
  hero:
    fontFamily: system-sans
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.02em
  display-lg:
    fontFamily: system-sans
    fontSize: 38px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: -0.02em
  h1:
    fontFamily: system-sans
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.01em
  h2:
    fontFamily: system-sans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  h3:
    fontFamily: system-sans
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  kicker:
    fontFamily: system-sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.02em
  body-md:
    fontFamily: system-sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 0
  body-emphasis:
    fontFamily: system-sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.65
    letterSpacing: 0
  muted-sm:
    fontFamily: system-sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  label:
    fontFamily: system-sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontFamily: system-sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  micro:
    fontFamily: system-sans
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.02em
  button-md:
    fontFamily: system-sans
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  button-sm:
    fontFamily: system-sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  stat-value:
    fontFamily: system-sans
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  stat-value-lg:
    fontFamily: system-sans
    fontSize: 34px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.02em
  numeric-tabular:
    fontFamily: system-sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
    fontVariantNumeric: tabular-nums

rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  section: 48px
  page: 64px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
    height: 48px
  button-primary-sm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
    height: 36px
  button-primary-disabled:
    backgroundColor: "{colors.border}"
    textColor: "{colors.muted-soft}"
    rounded: "{rounded.pill}"
  button-glass:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
    height: 48px
  button-white:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
    height: 48px
  button-danger:
    backgroundColor: "{colors.background}"
    textColor: "{colors.danger}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
    height: 48px
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    padding: 6px 0
  card-glass:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xl}"
  card-panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-stat:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.stat-value}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-course:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  card-course-viewed:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  card-todo:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  heatmap-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    height: 44px
  heatmap-cell-viewed:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-primary}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    height: 44px
  progress-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    height: 8px
  sidebar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    padding: "{spacing.md}"
  sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    height: 44px
  sidebar-item-active:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    height: 44px
  topbar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.muted-sm}"
    height: 64px
    padding: 0 24px
  visitor-counter:
    backgroundColor: "{colors.neutral-wash}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 6px 12px
    height: 32px
  cohort-select:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 10px 14px
    height: 40px
  text-input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 14px
    height: 48px
  text-input-focused:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  text-input-error:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  textarea:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  choice-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 14px 16px
    height: 52px
  choice-row-selected:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.md}"
    padding: 14px 16px
    height: 52px
  question-card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  question-card-required-error:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  dropzone:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.muted-sm}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xxl}"
  attachment-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.muted-sm}"
    rounded: "{rounded.md}"
    padding: 12px 14px
    height: 52px
  data-table:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.numeric-tabular}"
    rounded: "{rounded.xl}"
  data-table-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.micro}"
    height: 44px
    padding: 0 16px
  data-table-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.numeric-tabular}"
    height: 52px
    padding: 0 16px
  matrix-cell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-soft}"
    typography: "{typography.caption}"
    height: 40px
  matrix-cell-submitted:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    height: 40px
  badge-course-no:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    padding: 4px 8px
  badge-new:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.accent-deep}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: 3px 8px
  badge-role:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    padding: 4px 10px
  badge-role-soft:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    padding: 4px 10px
  status-pill-neutral:
    backgroundColor: "{colors.neutral-wash}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-open:
    backgroundColor: "{colors.warning-wash}"
    textColor: "{colors.warning}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-done:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-closed:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  answer-mark-correct:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  answer-mark-wrong:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  score-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.stat-value-lg}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  chart-panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  grid-heat-cell:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    height: 40px
  builder-block:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  builder-block-dragging:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  toolbar-sticky:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
    height: 68px
  dialog:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  dialog-danger:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  toast:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.on-primary}"
    typography: "{typography.muted-sm}"
    rounded: "{rounded.lg}"
    padding: 14px 18px
  empty-state:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.muted-sm}"
    rounded: "{rounded.xl}"
    padding: "{spacing.page}"
  auth-panel:
    backgroundColor: "{colors.glass-top}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  footer-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-soft}"
    typography: "{typography.caption}"
    height: 56px
    padding: 0 24px
---

## Overview

AX오픈랩 LMS는 **교육 운영 도구**다. 하루에 여러 번, 한 손에 커피를 들고 여는 화면이므로 시각 언어의 목표는 "인상적"이 아니라 **읽는 데 힘이 안 드는 것**이다. 시스템은 흰 배경(`{colors.background}`)과 웜 그레이 면(`{colors.surface}`) 위에 네이비(`{colors.primary}`)로 구조를 짜고, 골드(`{colors.accent}`)를 **성취 신호 하나에만** 쓴다.

세 가지 **표면 모드(surface mode)** 가 전체 화면을 나눈다.

1. **오로라 모드 — 인증·랜딩 화면** (로그인 / 회원가입 / 비밀번호 재설정)
   흰 배경 위 블루·골드·바이올렛 블롭이 알파 0.5~0.7로 떠 있고 14~17초 드리프트 애니메이션이 돈다. 콘텐츠는 `auth-panel` 글래스 패널 안에 들어간다. 브랜드의 얼굴이 되는 유일한 구간.
2. **업무 모드 — 학습자·관리자 전 화면**
   같은 오로라를 **알파 0.24~0.38로 낮추고 애니메이션을 끈다.** 콘텐츠는 `card-panel`(불투명 흰 카드) 위에 올린다. 데이터를 읽는 화면에서 글래스 블러 뒤에 숫자를 놓지 않는다.
3. **집중 모드 — 설문 응답·퀴즈 응시**
   오로라 없음. `{colors.surface}` 단색 배경에 중앙 정렬 720px 컬럼. 문항 하나에만 시선이 가야 하므로 장식 요소를 전부 뺀다.

골드는 시스템의 **보상 색**이다. 열람 완료 히트맵 셀, 진행률 바의 채워진 부분, KPI 카드의 상승 지표, 정답 공개 화면의 하이라이트 — 학습자가 "해냈다"고 느끼는 지점에만 등장한다. 반대로 **모든 클릭 가능한 것(CTA·링크·활성 메뉴)은 네이비**다. 이 분리를 지키면 화면이 아무리 조밀해져도 "누를 것"과 "달성한 것"이 혼동되지 않는다.

**핵심 특성:**
- 흰 캔버스 + 저채도 정적 오로라가 업무 화면의 기본 배경 — 데이터 화면에 글래스/블러 금지
- 네이비 = 구조·CTA·링크 / 골드 = 성취·강조 (겹치지 않음, 한 화면에 골드 강조는 최대 2곳)
- 버튼은 전부 `{rounded.pill}`, 카드는 `{rounded.xl}`(16px) 또는 `{rounded.xxl}`(24px), 표·입력은 `{rounded.md}`(8px)
- 시맨틱 컬러는 상태 배지에만: `{colors.success}` 제출/정답, `{colors.warning}` 대기/마감임박, `{colors.danger}` 오답/취소/삭제
- **컬러 이모지 전면 금지.** 아이콘은 Tabler 라인 아이콘(13~20px, `stroke-width: 1.75`)만 사용
- 한국어 전용 — 모든 텍스트 컨테이너에 `word-break: keep-all`
- 좌측 사이드바(240px) + 우측 콘텐츠 셸이 학습자·관리자 공통 골격, 우측 상단에 방문자 카운터, 전 화면 하단에 `footer-bar`

## Colors

> **Interaction 하위 섹션 없음.** hover 값은 각 컴포넌트 스펙에 기술한다. 허용 하위 섹션: Brand & Accent, Surface, Text, Semantic, Data.

### Brand & Accent
- **Navy** (`{colors.primary}` — `#1a3356`): 시스템의 뼈대. Primary 버튼 채움, 링크, 활성 사이드바 텍스트, 강좌 번호 배지, 표 헤더 텍스트, 1순위 차트 시리즈.
- **Navy Hover** (`{colors.primary-hover}` — `#142945`): Primary 버튼 hover/pressed.
- **Navy Light** (`{colors.primary-light}` — `#e4ecf4`): 활성 사이드바 항목 배경, 아이콘 원형 배경, 소프트 역할 배지.
- **Navy Tint** (`{colors.primary-tint}` — `#f2f6fa`): 선택된 보기 행, 할 일 위젯 배경, 그리드 히트맵의 최저 농도.
- **Gold** (`{colors.accent}` — `#c89c4a`): **성취 전용.** 열람 완료 히트맵 셀, 진행률 바 채움, 2순위 차트 시리즈, 헤드라인 하이라이트 밑줄. CTA에 절대 쓰지 않는다.
- **Gold Light** (`{colors.accent-light}` — `#fdf4e0`): NEW 배지, 히트맵 최저 농도 단계, 골드 계열 배경 워시.
- **Gold Deep** (`{colors.accent-deep}` — `#a67d33`): 골드 워시 위의 텍스트 색 (`accent-light` 배경에서 AA 확보용). 골드 원색 `#c89c4a` 위에 흰 텍스트를 올리지 않는다 — 대비 부족.
- **Gold Wash** (`{colors.accent-wash}` — `rgba(200,156,74,0.35)`): 헤드라인 단어 하이라이트 `linear-gradient(180deg, transparent 60%, {colors.accent-wash} 60%)`.

### Surface
- **Background** (`{colors.background}` — `#ffffff`): 페이지 기본, 카드 기본, 표 행 배경.
- **Surface** (`{colors.surface}` — `#f6f4f0`): 웜 그레이 면 — 표 헤더, 미열람 히트맵 셀, 드롭존, 집중 모드 배경, 빈 상태 패널.
- **Surface Sunken** (`{colors.surface-sunken}` — `#efece6`): 표 내부 그룹 헤더, 비활성 탭 트랙 등 한 단계 더 눌린 면.
- **Glass** (`{colors.glass-top}` / `{colors.glass-bottom}`): `linear-gradient(160deg, …)` + `backdrop-filter: blur(14px)`. **인증 화면 패널과 sticky 툴바에만** 허용.
- **Border** (`{colors.border}` — `#e2dfd9`): 모든 카드·입력·표 구분선의 기본 1px 보더.
- **Border Soft** (`{colors.border-soft}` — `rgba(228,228,231,0.7)`): 통계 카드처럼 조밀하게 반복되는 요소의 약한 보더.

### Text
- **Foreground** (`{colors.foreground}` — `#0f1419`): 제목·본문·표 데이터의 기본 잉크.
- **Muted** (`{colors.muted}` — `#475467`): 보조 설명, 표 헤더 라벨, 사이드바 비활성 항목, 폼 힌트.
- **Muted Soft** (`{colors.muted-soft}` — `#71717a`): 통계 카드 캡션, 타임스탬프, footer 텍스트, 미제출 `○` 마크.
- **On Primary** (`{colors.on-primary}` — `#ffffff`): 네이비 면 위 텍스트.

### Semantic
- **Success** (`{colors.success}` — `#059669`) + wash `{colors.success-wash}` (`#d1fae5`): 과제 제출됨, 퀴즈 정답, 설문 응답 완료, 채점 완료.
- **Warning** (`{colors.warning}` — `#d97706`) + wash `{colors.warning-wash}` (`#fef3c7`): 마감 임박(D-3), 채점 대기, 미답변 문의, 미응답 잔여 건수.
- **Danger** (`{colors.danger}` — `#dc2626`) + wash `{colors.danger-wash}` (`#fee2e2`): 퀴즈 오답, 로그인 실패, 5MB 초과, 삭제·마감 확정 다이얼로그.
- **Neutral** (`{colors.neutral-wash}` — `rgba(26,51,86,0.08)`): 상태 없는 정보 필 — 방문자 카운터, 첨부 개수, 기수 라벨.
- ⚠️ **마감 경과는 danger가 아니다.** PRD Q2 확정에 따라 지각 개념이 없으므로 마감 경과는 `{colors.muted}` 텍스트로 "마감일 경과" 안내만 표시한다. 붉은색·경고 아이콘·지각 배지를 쓰면 삭제된 정책을 시각적으로 되살리는 것이다.

### Data
차트 시리즈는 **항상 이 순서대로** 사용한다: `{colors.chart-1}` `#1a3356` → `{colors.chart-2}` `#c89c4a` → `{colors.chart-3}` `#5b8cff` → `{colors.chart-4}` `#8b5cf6` → `{colors.chart-5}` `#7d90a8`. 5개를 넘으면 상위 4개 + "기타"로 묶는다.

히트맵 농도 램프는 5단계 고정: `{colors.heat-0}` → `{colors.heat-1}` → `{colors.heat-2}` → `{colors.heat-3}` → `{colors.heat-4}`. 설문 그리드형 통계, 강좌 열람률 매트릭스, 방문 추이 캘린더가 모두 같은 램프를 쓴다. 농도만으로 판단하게 하지 않고 **셀 안에 숫자를 함께 표기**한다(색맹 대응).

## Typography

### Font Family

브랜드 전용 폰트는 없다. 시스템 스택을 그대로 쓴다:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic',
             'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
```

한국어 UI이므로 두 규칙이 절대적이다: (1) 모든 텍스트 블록에 `word-break: keep-all`, (2) 본문 line-height는 **1.65** — 라틴 기준 1.5는 한글에서 답답하다. 숫자가 열로 정렬되는 모든 표·통계에는 `font-variant-numeric: tabular-nums`(`{typography.numeric-tabular}`).

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.hero}` | 56px | 800 | 1.1 | 로그인/랜딩 히어로 한 줄 |
| `{typography.display-lg}` | 38px | 800 | 1.2 | "{성명}님, 안녕하세요." 대시보드 인사말 |
| `{typography.h1}` | 30px | 700 | 1.3 | 페이지 제목 (내 교육과정, 설문 관리 등) |
| `{typography.h2}` | 20px | 700 | 1.4 | 섹션 제목, 강좌 상세 강좌명, 다이얼로그 제목 |
| `{typography.h3}` | 16px | 700 | 1.5 | 카드 제목, 문항 텍스트, 표 그룹 헤더 |
| `{typography.kicker}` | 13px | 600 | 1.4 | 그라디언트 키커 (인증 화면 전용) |
| `{typography.body-md}` | 16px | 400 | 1.65 | 기본 본문, 강좌 리치 텍스트, 보기 라벨 |
| `{typography.body-emphasis}` | 16px | 600 | 1.65 | 선택된 보기, 런인 강조 |
| `{typography.muted-sm}` | 14px | 400 | 1.6 | 보조 설명, 한 줄 요약, 폼 힌트 |
| `{typography.label}` | 13px | 600 | 1.4 | 폼 라벨, 사이드바 항목, 텍스트 버튼 |
| `{typography.caption}` | 12px | 400 | 1.5 | 캡션, 타임스탬프, 방문자 카운터, footer |
| `{typography.micro}` | 11px | 600 | 1.3 | 배지, 표 헤더 라벨(대문자 아님), 강좌 번호 |
| `{typography.button-md}` | 15px | 600 | 1.2 | 기본 버튼 라벨 |
| `{typography.button-sm}` | 13px | 600 | 1.2 | 표 내부·헤더 컴팩트 버튼 |
| `{typography.stat-value}` | 24px | 700 | 1.2 | 통계 카드 수치 |
| `{typography.stat-value-lg}` | 34px | 800 | 1.1 | 퀴즈 점수 히어로, 대시보드 총합 KPI |
| `{typography.numeric-tabular}` | 14px | 500 | 1.5 | 표 셀 숫자, 점수, 파일 용량 |

### Principles

이 시스템은 **한글에 letter-spacing 양수를 주지 않는다.** 자간을 벌리면 한글 조합자가 흩어져 읽기 속도가 떨어진다. 큰 제목(30px 이상)에만 `-0.01em ~ -0.02em`의 음수 자간을 넣어 덩어리감을 만든다.

버튼 라벨도 **대문자 변환·자간 확대를 하지 않는다** (HP식 uppercase 트래킹은 한국어에 적용 불가). 위계는 오직 **크기와 굵기(400 / 600 / 700 / 800)** 로 만든다. 이탤릭은 시스템 전체에서 사용하지 않는다.

골드 하이라이트는 텍스트 색이 아니라 **밑줄 워시**로 쓴다: `background: linear-gradient(180deg, transparent 60%, {colors.accent-wash} 60%)`. 골드를 텍스트 색으로 쓰면 흰 배경에서 대비가 3:1 아래로 떨어져 WCAG AA를 위반한다 — 골드 텍스트는 `{colors.accent-deep}`(`#a67d33`)를 쓰거나 `{colors.accent-light}` 배경 위에서만 허용한다.

## Layout

### Spacing System

- **기준 단위**: 4px. 실사용 값은 8의 배수를 우선한다.
- **토큰**: `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 20 · `{spacing.xl}` 24 · `{spacing.xxl}` 32 · `{spacing.section}` 48 · `{spacing.page}` 64
- **카드 내부 패딩**: `{spacing.xl}`(24px) 기본, 통계 카드·할 일 위젯은 `{spacing.md}`(16px), 다이얼로그·점수 히어로는 `{spacing.xxl}`(32px)
- **대시보드 섹션 간격**: `{spacing.xxl}`(32px). 관리자 통계 블록 사이는 `{spacing.section}`(48px)
- **콘텐츠 영역 패딩**: 데스크톱 `{spacing.xxl}`(32px), 모바일 `{spacing.md}`(16px)
- **그리드 거터**: `{spacing.lg}`(20px) 기본, 히트맵 셀 간격은 `{spacing.xs}`(8px)

HP류 마케팅 사이트의 80px 섹션 리듬은 **쓰지 않는다.** 업무 도구에서 스크롤 한 번에 보이는 정보량이 곧 효율이므로 32~48px이 리듬 상수다.

### Grid & Container

- **앱 셸**: 좌측 사이드바 **240px 고정** + 우측 콘텐츠 `flex: 1`, 콘텐츠 최대 폭 **1280px** 중앙 정렬. 관리자 통계·매트릭스 화면은 최대 폭 해제(`max-width: none`)하고 표를 가로 스크롤한다.
- **상단 바**: 콘텐츠 영역 상단에 sticky, 높이 64px. 좌측에 페이지 제목(또는 기수 선택 드롭다운), 우측에 방문자 카운터 + 프로필.
- **강좌 카드 그리드**: `repeat(auto-fill, minmax(280px, 1fr))` — 1280px에서 4열, 1024px에서 3열, 768px에서 2열, 그 이하 1열.
- **히트맵 그리드**: `repeat(auto-fill, minmax(44px, 1fr))`, 셀은 정사각형(`aspect-ratio: 1`). 20강좌 기준 데스크톱 10열 × 2행.
- **관리자 KPI 행**: 4열 통계 카드(`minmax(200px, 1fr)`), 그 아래 차트 패널 2열.
- **설문·퀴즈 응답 화면(집중 모드)**: 사이드바 없음, 중앙 **720px** 단일 컬럼.
- **인증 화면**: 데스크톱 좌우 2분할 — 좌측 브랜드/기능 칩(글래스), 우측 `auth-panel` 폼(최대 420px). 태블릿 이하 폼만 단일 컬럼.

### Whitespace Philosophy

여백은 **읽기 단위를 구분하는 데만** 쓴다. 카드 사이는 넉넉하게(20~32px), 카드 안 라벨-값 사이는 조밀하게(4~8px). 표는 행 높이 52px로 손가락과 눈이 행을 놓치지 않는 최소치를 지키고, 그 이상 늘려 "여유롭게" 만들지 않는다 — 20명 × 20강좌 매트릭스가 한 화면에 들어가는 것이 미학보다 중요하다.

빈 상태는 여백으로 때우지 않는다. `empty-state` 패널에 **한 줄 설명 + 다음 행동 버튼**을 반드시 함께 놓는다("아직 등록된 설문이 없습니다 · 설문 만들기").

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | 보더·그림자 없음 | 섹션 배경, 오로라 레이어, 히트맵 셀, 표 행 |
| 1 — Hairline | `1px solid {colors.border}` | 카드, 입력, 표 외곽, 보기 행, 첨부 행 — 시스템의 기본값 |
| 2 — Soft Lift | `0 14px 30px -14px rgba(26,51,86,0.35)` | Primary/White 버튼, 통계 카드 hover, 드래그 중인 빌더 블록 |
| 3 — Glass Lift | `0 18px 50px -22px rgba(26,51,86,0.32), inset 0 1px 0 rgba(255,255,255,0.7)` | 인증 패널, sticky 툴바 — 글래스 표면 전용 |
| 4 — Overlay | `0 26px 52px -26px rgba(26,51,86,0.42)` | 다이얼로그, 드롭다운 메뉴, 토스트, 모바일 드로어 |

깊이는 **색 대비로 먼저** 표현한다(흰 카드 vs `{colors.surface}` 면). 그림자는 항상 네이비 저채도 계열 `rgba(26,51,86,…)`이며 **검정 그림자를 쓰지 않는다** — 웜 그레이 배경에서 검정 그림자는 탁하게 번진다.

### Decorative Depth

시스템의 유일한 장식은 **오로라 블롭**이다. `position: absolute`, `border-radius: 9999px`, `filter: blur(58px)`, `pointer-events: none`. 인증 화면은 알파 0.5~0.7 + `translate/scale` 드리프트(14~17s, `ease-in-out infinite`), 업무 화면은 알파 0.24~0.38 + **애니메이션 없음**. `@media (prefers-reduced-motion: reduce)`에서 모든 드리프트를 정지한다. 콘텐츠는 항상 블롭보다 위 레이어(`z-index: 10`)에 놓는다.

블롭은 화면당 최대 3개, 항상 뷰포트 가장자리에서 절반 잘려 들어온다. 콘텐츠 중앙에 블롭을 두지 않는다.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | 표 셀, 매트릭스 셀, 차트 축 |
| `{rounded.sm}` | 6px | 체크박스, 작은 필 내부 요소 |
| `{rounded.md}` | 8px | 입력, 텍스트에어리어, 보기 행, 사이드바 항목, 역할 배지, 강좌 번호 배지 |
| `{rounded.lg}` | 12px | 통계 카드, 빌더 블록, 드롭존, 토스트 |
| `{rounded.xl}` | 16px | 강좌 카드, 문항 카드, 차트 패널, 표 컨테이너 |
| `{rounded.xxl}` | 24px | 글래스 패널, 다이얼로그, 점수 히어로 |
| `{rounded.pill}` | 9999px | **모든 버튼**, 상태 필, 진행률 바, NEW 배지, 오로라 블롭 |

시스템의 형태 규칙은 한 문장이다: **버튼은 완전한 pill, 컨테이너는 12~24px, 데이터가 들어가는 칸은 8px 이하.** 버튼에 8px 라운드를 주면 즉시 다른 브랜드처럼 보인다.

정사각형은 히트맵 셀에서만 의미를 가진다(`aspect-ratio: 1`, `{rounded.md}`) — 진행 상황을 세는 "칸"이라는 은유를 유지한다. 아바타는 원형(`{rounded.pill}`) 32px, 이니셜 텍스트 + `{colors.primary-light}` 배경.

## Components

> 각 컴포넌트는 Default / Hover / Active·Selected / Disabled 순으로 기술한다. 변형은 front matter에 별도 엔트리로 존재한다.

### Buttons

**`button-primary`** — 유일한 강조 CTA
- 배경 `{colors.primary}`, 텍스트 `{colors.on-primary}`, `{typography.button-md}`, 패딩 14×24, 높이 48px, `{rounded.pill}`, 그림자 `0 14px 30px -12px rgba(26,51,86,0.5)`
- hover: 배경 `{colors.primary-hover}` + **sheen 스윕** — 좌→우로 흰 반투명 띠가 1.1s 지나감(`skewX(-18deg)`). 폼 제출·주요 CTA에만 쓰고 표 안 버튼에는 sheen 없음
- disabled: `button-primary-disabled` — 배경 `{colors.border}`, 텍스트 `{colors.muted-soft}`, 그림자 제거, `cursor: not-allowed`
- 용도: 로그인, 회원가입, 과제 제출, 설문 제출, 퀴즈 제출, 강좌 저장

**`button-primary-sm`** — 컴팩트 CTA
- 높이 36px, 패딩 8×16, `{typography.button-sm}`, sheen 없음
- 용도: 표 행 액션, 카드 헤더 "새 강좌", 상단 바 액션

**`button-glass`** — 보조 액션(오로라 배경 위 전용)
- 배경 `linear-gradient(160deg, {colors.glass-top}, {colors.glass-bottom})`, `backdrop-filter: blur(14px)`, 1px `{colors.border}`, Glass Lift 그림자
- hover: `transform: translateY(-4px)`, `transition: .35s cubic-bezier(.22,1,.36,1)`
- 용도: 인증 화면 "회원가입", "비밀번호를 잊으셨나요?"

**`button-white`** — 업무 화면 보조 액션
- 배경 `{colors.background}`, 텍스트 `{colors.foreground}`, 1px `{colors.border}`, Soft Lift
- hover: `translateY(-2px)`
- 용도: "미리보기", "CSV 내보내기", "취소", "이전 강좌 / 다음 강좌"

**`button-danger`** — 파괴적 액션
- 배경 `{colors.background}`, 텍스트 `{colors.danger}`, 1px `{colors.danger}`
- hover: 배경 `{colors.danger-wash}`
- 용도: 강좌 삭제, 관리자 계정 삭제, **[퀴즈 마감]** (되돌릴 수 없는 채점 실행이므로 danger 계열, 항상 확인 다이얼로그 경유)

**`button-text`** — 인라인 링크 버튼
- 텍스트 `{colors.primary}`, `{typography.label}`, hover 시 밑줄
- 용도: "더보기", "문항 복제", "미응답자 명단 보기"

### App Shell

**`sidebar`** — 좌측 내비게이션 (학습자·관리자 공통)
- 폭 240px, 배경 `{colors.background}`, 우측 1px `{colors.border}`, 패딩 `{spacing.md}`
- 상단: 로고 + "AX오픈랩 LMS" (`{typography.h3}`), 그 아래 소속 기수 필(`status-pill-neutral`)
- 항목 리스트 → `sidebar-item` / `sidebar-item-active`. 하단에 구분선 + 내 정보 / 로그아웃
- 관리자: 기수 선택 드롭다운을 상단 바에 두고 사이드바에는 메뉴만. **슈퍼관리자 전용 섹션**은 리스트 하단에 `{spacing.md}` 간격 + 1px 구분선 + `{typography.micro}` `{colors.muted}` 섹션 라벨("시스템 총괄") 아래 묶어 노출 — 조건부 렌더링이며 시각적으로도 별도 구획임을 보인다

**`sidebar-item`** + **`sidebar-item-active`**
- Default: 텍스트 `{colors.muted}`, `{typography.label}`, 좌측 18px 라인 아이콘 + 10px 갭, 패딩 10×12, 높이 44px, `{rounded.md}`
- hover: 배경 `{colors.primary-tint}`
- Active: 배경 `{colors.primary-light}`, 텍스트·아이콘 `{colors.primary}`, weight 700. 좌측에 3px `{colors.primary}` 인디케이터 바
- 알림 수(미답변 문의 등)는 우측 정렬 `{typography.micro}` 필로 표시

**`topbar`**
- 높이 64px, 배경 `{colors.background}`, 하단 1px `{colors.border}`, sticky, 좌우 패딩 24px
- 좌: 페이지 제목 `{typography.h2}` (관리자 화면은 `cohort-select` 드롭다운이 제목 우측에 붙는다)
- 우: `visitor-counter` → 32px 아바타 + 성명 → 드롭다운(내 정보 / 로그아웃)
- 모바일: 좌측에 햄버거(44×44), 페이지 제목 생략 가능, 방문자 카운터는 숫자만 축약

**`visitor-counter`** — 방문자 수 카운터 (P0-19)
- 배경 `{colors.neutral-wash}`, 텍스트 `{colors.primary}`, `{typography.caption}`, `{rounded.pill}`, 패딩 6×12, 높이 32px
- 구성: 16px `users` **라인 아이콘** + `오늘 24` + `{colors.border}` 1px 세로 구분선 + `누적 1,382`, 숫자는 `tabular-nums`
- ⚠️ PRD 표기 예시의 `👥` 이모지는 **사용하지 않는다** (디자인 시스템 이모지 금지 규칙 우선). 기능 명세는 PRD, 시각 표현은 본 문서를 따른다
- 모바일(<768px): `24 · 1,382`로 축약, 아이콘 유지, 툴팁으로 전체 라벨 제공

**`footer-bar`** — 전 화면 공통 푸터 (P0-20)
- 높이 56px, 상단 1px `{colors.border}`, 텍스트 `{colors.muted-soft}` `{typography.caption}`, 중앙 정렬
- 내용: `Produced by AXopenLab / xshoner@gmail.com` — 메일은 `{colors.primary}` `mailto:` 링크
- 콘텐츠 영역 끝에 붙되 sticky 아님. 집중 모드·인증 화면에서도 동일하게 노출

### Cards & Containers

**`card-panel`** — 업무 화면의 기본 컨테이너
- 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.xl}`, 패딩 `{spacing.xl}`, 그림자 없음
- 헤더 행: 제목 `{typography.h2}` + 우측 액션(`button-primary-sm` / `button-text`), 헤더와 본문 사이 `{spacing.lg}`
- 데이터가 들어가는 모든 블록의 기본값. **글래스로 대체하지 않는다**

**`card-glass`** — 인증·랜딩 전용
- `{colors.glass-top}`→`{colors.glass-bottom}` 그라디언트, `blur(14px)`, 1px `{colors.border}`, `{rounded.xxl}`, 패딩 `{spacing.xl}`, Glass Lift
- hover: `translateY(-6px)` + 그림자 강화(`.35s cubic-bezier(.22,1,.36,1)`)

**`card-stat`** — KPI 통계 카드
- 배경 `{colors.background}`, 1px `{colors.border-soft}`, `{rounded.lg}`, 패딩 `{spacing.md}`
- 구성: 라벨 `{typography.caption}` `{colors.muted-soft}` → 값 `{typography.stat-value}` `{colors.primary}` → 캡션 `{typography.micro}` `{colors.muted-soft}`
- 증감 표기는 `{colors.success}` / `{colors.danger}` 텍스트 + 삼각형 라인 아이콘 12px, 화살표 이모지 금지
- 대시보드 총합 KPI(전체 학생 수 등) 1개만 `{typography.stat-value-lg}`로 격상 — 한 화면에 하나

**`card-course`** — 강좌 카드 (SCR-04)
- 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.xl}`, 패딩 `{spacing.lg}`
- 레이아웃(위→아래): `badge-course-no`(01) + 열람 상태 필 → 강좌명 `{typography.h3}` → 한 줄 요약 `{typography.muted-sm}` 2줄 클램프 → 하단 메타 행(첨부 n · 설문 필 · 퀴즈 필)
- hover: `translateY(-4px)` + Soft Lift, 보더 `{colors.primary-light}`
- **`card-course-viewed`**: 열람 완료 시 좌측에 3px `{colors.accent}` 세로 스트립을 붙인다(배경 변경 아님 — 카드 그리드가 얼룩지지 않게)

**`card-todo`** — 할 일 위젯 (SCR-03)
- 배경 `{colors.primary-tint}`, `{rounded.lg}`, 패딩 `{spacing.md}`, 보더 없음
- 3분할 그리드: 미제출 과제 / 미응답 설문 / 미응시 퀴즈. 각 칸 = 라인 아이콘 + 건수 `{typography.stat-value}` + 라벨 `{typography.caption}`, 전체가 바로가기 링크
- 건수 0인 칸은 숨기지 않고 값 `0` + `{colors.muted-soft}`로 표시. 3칸 모두 0이면 위젯 전체를 "지금 할 일이 없습니다" 한 줄로 교체

**`empty-state`**
- 배경 `{colors.surface}`, `{rounded.xl}`, 패딩 `{spacing.page}`, 중앙 정렬
- 32px 라인 아이콘(`{colors.border}` 색) → 제목 `{typography.h3}` → 설명 `{typography.muted-sm}` → `button-primary-sm`

### 학습 진행 (Signature)

**`heatmap-cell`** + **`heatmap-cell-viewed`** — 강좌 열람 히트맵 (P0-04)
시스템의 시그니처 컴포넌트. 골드가 여기서 가장 강하게 등장한다.
- 그리드: `repeat(auto-fill, minmax(44px, 1fr))`, 갭 `{spacing.xs}`, 셀 `aspect-ratio: 1`, `{rounded.md}`
- **미열람**: 배경 `{colors.surface}`, 번호 텍스트 `{colors.muted}` `{typography.micro}`, 1px `{colors.border}`
- **열람**: 배경 `{colors.accent}`, 번호 `{colors.on-primary}` weight 700, 보더 없음
- hover: `scale(1.06)` + 강좌명 툴팁(`{colors.foreground}` 배경, `{rounded.md}`, `{typography.caption}`, 12px 오프셋)
- 열람 전환 애니메이션: 배경색 `.4s ease` + 한 번의 `scale(1 → 1.12 → 1)` 펄스. `prefers-reduced-motion`에서는 색만 변경
- 포커스: 2px `{colors.primary}` 아웃라인 + 2px 오프셋. 키보드 화살표로 셀 간 이동 가능
- 셀 위에 체크 표시·이모지를 얹지 않는다 — 색과 번호만으로 읽힌다. 단, 색만으로 구분되므로 **`aria-label`에 "07강 열람 완료"를 반드시 넣는다**

**`progress-bar`** — 열람 진행률
- 트랙 `{colors.surface}`, 채움 `{colors.accent}`, 높이 8px, `{rounded.pill}`, 채움 전환 `.6s cubic-bezier(.22,1,.36,1)`
- 바 위 라벨: `12 / 20 강좌 열람` `{typography.label}` + `(60%)` `{colors.muted}`. 숫자는 `tabular-nums`
- 100% 달성 시 채움을 `linear-gradient(90deg, {colors.accent-deep}, {colors.accent})`로 바꾸고 라벨 우측에 "전 강좌 열람 완료" 필(`status-pill-done`)을 붙인다

### Inputs & Forms

**`text-input`** / `-focused` / `-error`
- Default: 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.md}`, 패딩 12×14, 높이 48px, `{typography.body-md}`, placeholder `{colors.muted-soft}`
- Focused: 보더 `{colors.primary}` + `box-shadow: 0 0 0 3px {colors.primary-light}` (halo)
- Error: 보더 `{colors.danger}` + halo `{colors.danger-wash}`, 하단에 12px 아이콘 + 오류 메시지 `{typography.caption}` `{colors.danger}`, 간격 6px
- 라벨은 항상 입력 위 `{typography.label}` `{colors.muted}`, 간격 6px. 플로팅 라벨 사용 금지
- 필수 표시는 라벨 뒤 `{colors.danger}` 별표 하나

**`textarea`** — 장문형 응답·문의·안내문
- `text-input`과 동일 스타일, `min-height: 140px`, `resize: vertical`
- 글자 수 제한이 있으면 우측 하단에 `128 / 500` `{typography.caption}`, 90% 초과 시 `{colors.warning}`

**`choice-row`** + **`choice-row-selected`** — 선다형 보기 (설문·퀴즈 공통)
- Default: 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.md}`, 패딩 14×16, 최소 높이 52px, 라디오/체크박스 20px + 12px 갭
- hover: 배경 `{colors.primary-tint}`, 보더 `{colors.primary-light}`
- Selected: 배경 `{colors.primary-tint}`, 보더 2px `{colors.primary}`(패딩 1px 보정), 텍스트 `{typography.body-emphasis}` `{colors.primary}`
- **행 전체가 클릭 영역**이다. 컨트롤만 누르게 하지 않는다
- OX형은 예외: 2칸 그리드에 `aspect-ratio: 2/1` 큰 버튼, O/X 글리프 `{typography.stat-value-lg}`. 선택 시 `choice-row-selected` 규칙 동일

**`question-card`** + **`question-card-required-error`** — 문항 단위 컨테이너
- 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.xl}`, 패딩 `{spacing.xl}`, 카드 간 `{spacing.md}`
- 헤더: `Q3` `{typography.micro}` `{colors.muted}` + 필수 별표 → 문항 텍스트 `{typography.h3}` → 보기 영역(간격 `{spacing.xs}`)
- Required error: 좌측 3px `{colors.danger}` 스트립 + 하단 오류 메시지. 제출 차단 시 첫 오류 문항으로 부드럽게 스크롤하고 포커스를 옮긴다
- 그리드형은 카드 안에 `matrix` 테이블 — 좌측 첫 열에 행 라벨(sticky), 상단에 척도 라벨, 셀 중앙 라디오. 모바일에서는 행 단위 카드로 분해하고 척도를 세로 리스트로 전환

**`dropzone`** — 과제 파일 업로드 (SCR-06)
- 배경 `{colors.surface}`, 2px **dashed** `{colors.border}`, `{rounded.lg}`, 패딩 `{spacing.xxl}`, 중앙 정렬
- 내용: 24px 업로드 라인 아이콘 → "파일을 끌어다 놓거나 클릭하여 선택" `{typography.muted-sm}` → 제약 안내 `{typography.caption}` `{colors.muted-soft}`: "최대 5MB · pdf, docx, pptx, xlsx, hwp, hwpx, zip, ipynb, py, txt, png, jpg"
- dragover: 배경 `{colors.primary-tint}`, 보더 2px solid `{colors.primary}`
- 초과·확장자 오류: 보더 `{colors.danger}`, 배경 `{colors.danger-wash}`, 메시지 "5MB를 초과했습니다 (선택한 파일 6.2MB)" — 실제 용량을 항상 함께 보여준다
- 업로드 중: 하단에 `progress-bar` 변형(채움 `{colors.primary}`) + 퍼센트

**`attachment-row`** — 첨부 목록 행 (SCR-05 / 관리자)
- 배경 `{colors.background}`, 하단 1px `{colors.border}`, 패딩 12×14, 높이 52px
- 좌: 18px 파일 타입 라인 아이콘 + 파일명 `{typography.muted-sm}` (긴 이름은 중간 생략) / 우: 용량 `{typography.caption}` `{colors.muted-soft}` + 다운로드 아이콘 버튼(44×44 히트박스)
- hover: 배경 `{colors.primary-tint}`

**`cohort-select`** — 기수 선택 드롭다운 (관리자 컨텍스트 전환, P0-13)
- 배경 `{colors.background}`, 1px `{colors.primary-light}`, `{rounded.md}`, 패딩 10×14, 높이 40px, 텍스트 `{colors.primary}` `{typography.label}`, 우측 16px chevron
- 열림: Overlay 그림자 + 항목 높이 44px, 선택 항목 배경 `{colors.primary-light}` + 좌측 체크 라인 아이콘
- 기수 상태(준비중/진행중/종료)를 항목 우측 `status-pill-*`로 함께 표시
- 컨텍스트 전환 시 콘텐츠 영역에 200ms 페이드 + "3기 기준으로 표시 중" 필을 페이지 제목 옆에 남긴다 — 어떤 기수를 보고 있는지 항상 화면에 있어야 한다

### Badges & Status

**`badge-course-no`** — 강좌 번호
- 배경 `{colors.primary}`, 텍스트 `{colors.on-primary}`, `{typography.micro}`, `{rounded.md}`, 패딩 4×8, `tabular-nums`. 항상 2자리(`01`)

**`badge-new`** — 신규 공지 (3일)
- 배경 `{colors.accent-light}`, 텍스트 `{colors.accent-deep}`, `{typography.micro}`, `{rounded.pill}`, 패딩 3×8, 라벨 `NEW`

**`badge-role`** / **`badge-role-soft`**
- 필드: `{typography.micro}`, `{rounded.md}`, 패딩 4×10. 슈퍼관리자 = `badge-role`(네이비 채움), 관리자 = `badge-role-soft`(`{colors.primary-light}`), 학습자는 배지 없음(기본 역할에 배지를 달지 않는다)

**`status-pill-*`** — 상태 필 (dot + 라벨)
- 공통: `{typography.caption}`, `{rounded.pill}`, 패딩 4×10, 8px dot + 6px 갭
- `status-pill-neutral` `{colors.neutral-wash}` / `{colors.primary}`: 초안, 미배정, 준비중, 기수 라벨
- `status-pill-open` `{colors.warning-wash}` / `{colors.warning}`: 진행중, 채점 대기, 미답변, 마감 임박(D-3)
- `status-pill-done` `{colors.success-wash}` / `{colors.success}`: 제출 완료, 응답 완료, 채점 완료, 답변 완료
- `status-pill-closed` `{colors.danger-wash}` / `{colors.danger}`: 마감, 비활성 계정, 취소
- **진행중 상태의 dot에만** 2s `pulse` 애니메이션 허용. 나머지는 정적

### Data Display

**`data-table`** — 목록·현황 표의 기본형
- 컨테이너: 1px `{colors.border}`, `{rounded.xl}`, `overflow: hidden`
- **`data-table-header`**: 배경 `{colors.surface}`, 텍스트 `{colors.muted}` `{typography.micro}`, 높이 44px, 좌우 패딩 16px, sticky(스크롤 시 상단 고정). 정렬 가능 열은 12px chevron 아이콘
- **`data-table-row`**: 높이 52px, 하단 1px `{colors.border}`, hover 배경 `{colors.primary-tint}`. 숫자·일시 열은 `{typography.numeric-tabular}` 우측 정렬, 텍스트 열은 좌측 정렬
- 첫 열(성명·강좌명)은 `position: sticky; left: 0` + 배경 유지 — 가로 스크롤 시에도 행을 식별할 수 있어야 한다
- 행 선택은 체크박스 열 + 선택 시 배경 `{colors.primary-light}`. 선택 건수는 표 상단 `toolbar-sticky`에 표시

**`matrix-cell`** + **`matrix-cell-submitted`** — 과제 제출 현황 매트릭스 (ADM-06)
- 셀 40×40 중앙 정렬, 보더는 표 격자선 1px `{colors.border}`
- **미제출**: `○` 글리프 `{colors.muted-soft}`, 배경 `{colors.background}`
- **제출됨**: `●` 글리프 `{colors.success}`, 배경 `{colors.success-wash}`
- ⚠️ **셀 상태는 이 두 가지뿐이다** (PRD Q2). 지각·부분 제출 등 제3의 상태를 색으로 도입하지 않는다
- hover: 셀 확대 없이 툴팁으로 "김학습 · 05강 · 2026-08-07 21:14 · 파일" 표시, 클릭 시 상세 드로어
- 열 헤더는 강좌 번호(`01`…) 세로 회전 없이 그대로, 행 헤더는 성명 sticky

**`chart-panel`** — 차트 컨테이너
- `card-panel`과 동일 골격 + 헤더에 제목/기간 필터, 본문 높이 260~320px 고정
- 공통 차트 규칙:
  - 축·격자선 `{colors.border}` 1px, 격자는 **수평선만**. 축 라벨 `{typography.caption}` `{colors.muted}`
  - 시리즈 색은 `{colors.chart-1}`부터 순서대로. 단일 시리즈는 항상 `{colors.chart-1}`(네이비)
  - 막대 라운드 상단 `{rounded.sm}`, 막대 두께 최대 28px, 카테고리 갭 40%
  - 값 라벨을 막대 끝에 직접 표기(`{typography.caption}` `{colors.foreground}`) — 범례보다 직접 라벨을 우선한다
  - 도넛(응답률): 두께 14px, 채움 `{colors.chart-1}`, 트랙 `{colors.surface}`, 중앙에 `70%` `{typography.stat-value}` + `14 / 20명` `{typography.caption}`
  - 히스토그램(퀴즈 점수 분포): 막대 `{colors.chart-1}`, 평균선은 `{colors.accent}` 2px dashed + "평균 72점" 라벨
  - 정답률 막대에서 **정답률 40% 미만 문항은 막대 색을 `{colors.danger}`로 전환**하고 우측에 "재교육 필요" 필 — 재교육 시그널을 색으로 즉시 읽게 한다
  - 툴팁: `{colors.background}` 배경, 1px `{colors.border}`, `{rounded.md}`, Overlay 그림자, `{typography.caption}`
  - 애니메이션: 진입 시 400ms 그로우 한 번만. 반복 애니메이션 없음
- 데이터 0건: 차트 자리에 `empty-state` 축약형(패딩 `{spacing.xxl}`)

**`grid-heat-cell`** — 설문 그리드형 통계 히트맵 (ADM-04)
- 셀 높이 40px, 배경은 `{colors.heat-0}`~`{colors.heat-4}` 5단계 램프, 텍스트는 3단계 이하에서 `{colors.foreground}`, 4단계에서 `{colors.on-primary}`
- 셀 내용: 응답 수 + 비율 `{typography.caption}` (`8 · 40%`) — **농도만으로 읽게 하지 않는다**
- 행 우측에 행별 평균 점수 열(`{typography.numeric-tabular}` `{colors.primary}`), 표 우측 상단에 램프 범례

**`score-hero`** — 학습자 퀴즈 결과 헤더 (P0-25)
- 배경 `{colors.primary}`, `{rounded.xxl}`, 패딩 `{spacing.xxl}`, 텍스트 `{colors.on-primary}`
- 좌: `24 / 30` `{typography.stat-value-lg}` + `80%` `{colors.accent}` (네이비 위에서 골드가 AA를 만족하는 유일한 조합) / 우: 정답 `{colors.success-wash}` 텍스트 24문항 · 오답 4문항 요약
- 채점 전 접근: 이 블록 대신 `empty-state` — 시계 라인 아이콘 + "채점 대기 중입니다" + "관리자가 마감·채점을 실행하면 결과가 공개됩니다"

**`answer-mark-correct`** / **`answer-mark-wrong`** — 문항별 정오답 (P0-25)
- `question-card` 안에서 내 답변 행에 적용. Correct: 배경 `{colors.success-wash}`, 좌측 3px `{colors.success}` 스트립, 16px check 라인 아이콘. Wrong: `{colors.danger-wash}` + `{colors.danger}` 스트립 + x 라인 아이콘
- 정답 공개(관리자 옵션 on)일 때 오답 아래 "정답: 3번 — Row-Level Security" 행을 `{colors.success}` 텍스트로 추가. 옵션 off면 정답 행 자체를 렌더링하지 않는다(클라이언트 페이로드에도 없음)
- ✓/✗는 라인 아이콘으로 그린다. ✅❌ 이모지 금지

### Builder & Admin

**`builder-block`** + **`builder-block-dragging`** — 설문·퀴즈 문항 편집 블록 (ADM-04/05)
- 배경 `{colors.background}`, 1px `{colors.border}`, `{rounded.lg}`, 패딩 `{spacing.lg}`, 블록 간 `{spacing.sm}`
- 좌측 20px 드래그 핸들(`grip-vertical` 라인 아이콘, `{colors.border}` → hover `{colors.muted}`), 우측 상단 액션 아이콘 3개(복제·삭제·필수 토글, 각 32×32)
- 상단 행: 문항 유형 셀렉트(`cohort-select` 스타일 축약, 높이 36px) + 배점 입력(퀴즈만, 폭 80px)
- **정답 지정 UI(퀴즈)**: 보기 행 좌측에 라디오 대신 `정답` 토글 필 — 지정된 보기는 배경 `{colors.success-wash}`, 좌측 3px `{colors.success}`. 관리자 화면에서 정답은 **초록**, 학습자 화면에서 선택은 **네이비**로 색이 갈린다
- 정답 누락 상태: 블록 좌측 3px `{colors.warning}` 스트립 + "정답을 지정해야 공개할 수 있습니다" `{typography.caption}` `{colors.warning}`. 상단 툴바의 "공개" 버튼은 `button-primary-disabled`
- Dragging: `builder-block-dragging` — Soft Lift + `rotate(-0.4deg)` + opacity .96, 드롭 위치에 2px `{colors.primary}` 인디케이터 라인

**`toolbar-sticky`** — 빌더·표 상단 액션 바
- 배경 `{colors.glass-top}` + `blur(14px)`, 1px `{colors.border}`, `{rounded.xl}`, 패딩 `{spacing.md}`, 높이 68px, `position: sticky; top: 64px`
- 좌: 저장 상태 `{typography.caption}` ("모든 변경사항 저장됨" / 저장 중 스피너) / 우: `button-white` 미리보기 + `button-primary` 저장 + 상태 전환 버튼
- 업무 화면에서 글래스가 허용되는 두 번째 예외 — 아래 콘텐츠가 지나가는 것이 보여야 하기 때문

**`dialog`** / **`dialog-danger`**
- 배경 `{colors.background}`, `{rounded.xxl}`, 패딩 `{spacing.xxl}`, 최대 폭 480px, Overlay 그림자. 배경 오버레이 `rgba(15,20,25,0.45)`
- 구성: 제목 `{typography.h2}` → 본문 `{typography.body-md}` `{colors.muted}` → 액션 행(우측 정렬, `button-white` 취소 + 주 버튼)
- **`dialog-danger`**: 제목 좌측에 20px 경고 라인 아이콘 `{colors.danger}`, 주 버튼은 `button-danger`의 채움 변형(배경 `{colors.danger}`, 텍스트 흰색)
- 되돌릴 수 없는 액션은 결과를 문장으로 명시한다: "[퀴즈 마감] — 12명의 답안이 즉시 자동채점되고 신규 응시가 차단됩니다. 마감 후에는 재채점만 가능합니다."
- 기수 이동 확인(AC-11)은 `dialog` 기본형: "김학습 학생은 현재 2기 소속입니다. 3기로 이동하면 2기 소속이 해제됩니다."

**`toast`**
- 배경 `{colors.foreground}`, 텍스트 `{colors.on-primary}`, `{rounded.lg}`, 패딩 14×18, `{typography.muted-sm}`, 우측 하단 24px 오프셋, 4s 후 자동 소멸
- 좌측 16px 라인 아이콘(성공 `{colors.success-wash}` / 오류 `{colors.danger-wash}` 색), 되돌릴 수 있는 액션은 우측에 "되돌리기" `button-text` 흰색 변형

**`auth-panel`** — 로그인·회원가입 (SCR-01/02)
- 오로라(애니메이션 on) 배경 위 `card-glass` 규칙, 최대 폭 420px, 패딩 `{spacing.xxl}`
- 로고 → `{typography.kicker}` 그라디언트 키커("기수 기반 AI 교육 운영") → `{typography.h1}` "AX오픈랩 LMS" → 폼 → `button-primary` 전폭(width 100%) → 하단 `button-text` 2개(회원가입 / 비밀번호 재설정)
- 로그인 실패: 폼 상단에 `{colors.danger-wash}` 배너 + `{colors.danger}` 텍스트 "메일주소 또는 비밀번호가 올바르지 않습니다." (계정 존재 여부를 시사하는 어떤 시각 신호도 주지 않는다)
- 5회 실패 제한: 배너를 `{colors.warning-wash}`로 바꾸고 남은 시간 카운트다운 `tabular-nums` 표시, 입력·버튼 disabled
- 회원가입은 좌우 2열 폼(소속·성명 / 메일·패스워드) + 기수 코드 필드에 "미입력 시 미배정 상태로 가입되며 관리자가 배정합니다" 힌트. 실시간 중복 검사 결과는 필드 우측 16px 아이콘으로만(check/x 라인 아이콘 + 색)

## Do's and Don'ts

### Do
- 업무 화면 배경은 **정적 저채도 오로라**(알파 0.24~0.38) + 불투명 `card-panel` 조합을 쓴다
- 골드는 성취에만: 히트맵 열람 셀, 진행률 채움, 2순위 차트 시리즈, 헤드라인 밑줄 워시 — 한 화면에 최대 2곳
- 클릭 가능한 모든 것은 네이비, 모든 버튼은 `{rounded.pill}`
- 골드 텍스트가 필요하면 `{colors.accent-deep}`(`#a67d33`) 또는 네이비 배경 위에서만 쓴다
- 색으로 전달하는 모든 상태에 텍스트 라벨·숫자·`aria-label`을 함께 붙인다 (히트맵, 매트릭스, 히트맵 통계)
- 표 첫 열과 헤더는 sticky로 고정하고 행 높이 52px를 유지한다
- 마감 경과는 `{colors.muted}` 안내 문구로만 표시한다
- 아이콘은 Tabler 라인 아이콘 13~20px, `stroke-width: 1.75`, 색은 텍스트 색을 상속
- 모든 텍스트 컨테이너에 `word-break: keep-all`, 본문 line-height 1.65
- 되돌릴 수 없는 액션(퀴즈 마감, 삭제)은 `dialog-danger`에서 결과를 문장으로 명시한다

### Don't
- **컬러 이모지를 쓰지 않는다** — PRD 예시의 `👥`, ✅/❌ 포함. 전부 라인 아이콘으로 대체
- 데이터 화면(표·차트·매트릭스)에 글래스/`backdrop-filter`를 쓰지 않는다 — 허용 예외는 `auth-panel`과 `toolbar-sticky`뿐
- 골드를 CTA·링크·활성 상태에 쓰지 않는다. 반대로 네이비를 진행률·히트맵 열람 색에 쓰지 않는다
- 흰 배경 위에 골드 원색(`#c89c4a`) 텍스트를 놓지 않는다 (대비 3:1 미만)
- 지각 제출을 암시하는 색·배지·아이콘을 만들지 않는다 (PRD Q2에서 개념 삭제)
- 한글에 양수 letter-spacing이나 `text-transform: uppercase`를 적용하지 않는다
- 버튼 라운드를 `{rounded.pill}` 아래로 낮추지 않는다
- 업무 화면에서 오로라 블롭을 애니메이션하지 않고, `prefers-reduced-motion`을 무시하지 않는다
- 텍스트 투명도(opacity)로 위계를 만들지 않는다 — `{colors.muted}` / `{colors.muted-soft}`로 색을 바꾼다
- 차트 시리즈를 5개 넘게 쓰지 않고, 무지개 팔레트를 만들지 않는다
- 다크 모드를 임의로 구현하지 않는다 (PRD P2 항목 — v1 범위 밖)
- 퀴즈 정답을 채점 전 화면에 어떤 형태로도(숨김 요소·data 속성·클래스명 포함) 렌더링하지 않는다

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | 360–479px | 사이드바 → 햄버거 드로어, 단일 컬럼, 콘텐츠 패딩 16px, 히트맵 5열, 표는 카드 리스트로 전환 |
| Mobile-Large | 480–767px | 히트맵 6~7열, 강좌 카드 1열, 통계 카드 2열 |
| Tablet | 768–1023px | 사이드바 아이콘 전용(72px) 또는 드로어, 강좌 카드 2열, 통계 카드 2열, 차트 1열 |
| Desktop | 1024–1279px | 사이드바 240px 상시, 강좌 카드 3열, 통계 카드 4열, 차트 2열 |
| Desktop-Large | ≥1280px | 콘텐츠 최대 폭 1280px, 강좌 카드 4열, 매트릭스 최대 폭 해제 |

### Touch Targets

모든 인터랙티브 요소는 모바일에서 **44×44px 이상**을 확보한다. `sidebar-item` 44px, `heatmap-cell` 최소 44px(그리드 열 수를 줄여서 지키고 셀을 작게 만들지 않는다), `choice-row` 52px, 표 행 액션 아이콘은 시각 크기 18px + 44×44 투명 히트박스, 다운로드 아이콘 동일. `visitor-counter`는 표시 전용이므로 히트박스 예외.

### Collapsing Strategy

- **사이드바**: <1024px에서 드로어. 오버레이 `rgba(15,20,25,0.45)`, 좌측에서 280ms 슬라이드인, 폭 280px. 상단에 닫기 44×44
- **상단 바**: 모든 브레이크포인트에서 유지. <768px에서 페이지 제목 생략, 방문자 카운터 축약(`24 · 1,382`), 기수 선택 드롭다운은 콘텐츠 최상단으로 이동
- **히트맵**: 열 수만 줄이고 셀 크기는 44px 하한 유지. 진행률 바는 히트맵 위로 이동
- **강좌 카드 그리드**: 4 → 3 → 2 → 1열
- **데이터 표**: 태블릿까지 가로 스크롤(첫 열 sticky). **모바일에서는 행 → 카드 전환** — 성명을 제목으로, 나머지 열을 라벨-값 쌍으로 세로 나열
- **제출 현황 매트릭스**: 모바일에서 매트릭스를 포기하고 "강좌 선택 → 학생 목록" 2단 드릴다운으로 대체한다. 40px 셀을 억지로 축소하지 않는다
- **차트**: 2열 → 1열, 높이 260px 유지. 축 라벨이 겹치면 45° 회전 대신 라벨을 격 간격으로 솎아낸다
- **설문·퀴즈 응답**: 이미 단일 컬럼(720px)이므로 좌우 패딩만 16px로 축소. 그리드형 문항만 행 단위 카드로 분해
- **인증 화면**: <1024px에서 좌측 브랜드 패널 제거, `auth-panel`만 중앙 정렬. 오로라 블롭은 2개로 줄임
- **footer-bar**: 모든 브레이크포인트 유지, 모바일에서 2줄 허용

### Motion & Reduced Motion

전환은 짧고 한 번만: 색·배경 `.2s ease`, 위치·크기 `.35s cubic-bezier(.22,1,.36,1)`, 차트 진입 400ms, 드로어 280ms. `@media (prefers-reduced-motion: reduce)`에서 오로라 드리프트, sheen 스윕, 히트맵 펄스, 카드 lift, 차트 그로우를 모두 제거하고 색 변화만 남긴다.

## Iteration Guide

1. 한 번에 하나의 컴포넌트만 수정한다. 화면 전체 리팩터를 한 커밋에 담지 않는다
2. 값 대신 토큰 이름으로 말한다 (`{colors.primary}`, `{typography.h2}`, `{rounded.pill}`, `card-panel`) — 프로즈에서 hex/px로 풀어 쓰지 않는다
3. 새 상태는 프로즈에 묻지 않고 별도 컴포넌트 엔트리로 추가한다 (`-hover`, `-selected`, `-disabled`, `-error`)
4. 새 표면이 필요하면 `{colors.background}` / `{colors.surface}` / `{colors.surface-sunken}` / `{colors.primary-tint}` / 글래스 5종 안에서 고른다. 여섯 번째 표면을 만들지 않는다
5. 골드 사용을 추가할 때는 "이것이 학습자의 성취인가?"를 먼저 묻는다. 아니면 네이비다
6. 색으로 정보를 전달하는 요소를 추가할 때마다 텍스트 등가물(라벨·숫자·`aria-label`)을 같은 커밋에 넣는다
7. 새 차트는 `chart-panel` 공통 규칙(수평 격자, 시리즈 순서, 직접 값 라벨, 400ms 1회 애니메이션)을 그대로 상속받는다
8. 본 문서와 PRD가 충돌하면 **기능 명세는 PRD, 시각 표현은 본 문서**를 따른다 (PRD 5.2). 단 이모지 금지·지각 표기 금지는 두 문서가 일치하는 규칙이므로 예외 없다
9. WCAG AA 검증은 세 조합을 항상 확인한다: 흰 배경 위 `{colors.muted}`, `{colors.accent-light}` 위 `{colors.accent-deep}`, `{colors.primary}` 위 `{colors.accent}`
