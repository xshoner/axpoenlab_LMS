# 독립 화면 공유 MVP

교사 `test01.html`, 학생 `test02.html`에서 Daily Prebuilt 화면 공유를 실험한다.
테스트 파일은 `public/`에 있어 Vite가 그대로 제공·복사한다. 운영 `src/`, 진입 HTML,
빌드 설정, 패키지 의존성, Supabase DB·Auth·Realtime·Edge Functions는 변경하지 않는다.
운영 페이지는 테스트 자산을 로드하지 않는다. 별도 `test/daily-prebuilt-mvp` 브랜치이며
프로덕션 배포는 수행하지 않는다.

## 로컬 실행

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

- 교사: <http://localhost:5173/test01.html>
- 학생: 교사 화면의 **학생 화면 열기** 또는 **링크 복사** 사용.
- `file://`로 HTML을 직접 열지 않는다. localhost 또는 HTTPS 서버에서 실행한다.
- 다른 PC에서 시청하려면 이 브랜치를 별도 HTTPS 테스트 호스팅에 배포한다.
  다른 PC의 브라우저에서 `localhost`는 교사 PC가 아닌 해당 PC를 뜻한다.

## Daily 없이 동작 데모

1. 교사 화면의 기본 **동작 데모**에서 **교사 연결** 클릭.
2. **학생 화면 열기**를 눌러 같은 브라우저의 새 탭을 연다.
3. 학생이 **연결하고 대기**를 누르고 실습 메모를 작성한다.
4. 교사가 **화면 공유 시작**을 누르면 학생 화면에 데모가 자동 표시된다.
5. **공유 종료** 후 학생의 실습 화면과 작성한 메모가 그대로 복원된다.
6. 공유 중 학생 탭을 추가하거나 새로고침 후 재연결해도 현재 상태를 받는다.
7. 교사 연결 해제·탭 종료 시 복귀한다. 종료 신호가 유실되면 약 8~10초 후 복귀한다.

데모는 `BroadcastChannel`로 시작·종료만 전달하며 실제 화면·음성을 전송하지 않는다.
같은 origin·브라우저 프로필·저장소 파티션에서만 동작한다. 다른 PC, 다른 브라우저,
시크릿 창에는 연결되지 않는다. 백그라운드 탭 절전으로 응답 만료가 늦어지거나 일시 복귀할 수 있다.
서로 다른 테스트 코드는 별도 채널이다. 테스트 코드당 교사 탭 1개를 사용한다.

## 실제 Daily 화면 공유

1. [Daily 대시보드](https://dashboard.daily.co/)에서 이 MVP 전용 테스트 방을 만든다.
   운영 회의 방을 재사용하지 않는다. `https://<team>.daily.co/<room>` URL이 필요하다.
2. 방의 화면 공유를 허용하고 카메라·마이크 시작 상태를 꺼 둔다.
   바로 입장하려면 방 설정의 `enable_prejoin_ui: false`를 사용한다.
   입장 전 UI가 켜져 있으면 각 참가자가 Daily 프레임에서 추가로 입장 버튼을 눌러야 한다.
3. 교사 화면에서 **실제 화면 공유 · Daily Prebuilt**를 선택하고 방 URL 입력.
4. 비공개 방이면 교사 본인의 **입장 토큰**을 입력한다. Daily API 키를 입력하지 않는다.
5. 교사 연결 후 학생 링크를 보낸다. 학생도 같은 URL·테스트 코드로 연결하고 대기한다.
   비공개 방이면 학생은 각자의 입장 토큰을 입력한다. 교사 토큰은 초대 링크에 포함되지 않는다.
6. 교사가 **화면 공유 시작**을 클릭하고 공유할 탭·창·화면을 선택한다.
   학생의 기존 화면이 Daily 시청 화면으로 자동 전환된다.
7. **공유 종료** 또는 브라우저의 공유 중지를 누르면 학생 화면이 복귀한다.
   교사 퇴장도 Daily 참가자 상태로 감지한다. 네트워크 단절 감지는 Daily의 타임아웃에 따른다.

카메라·마이크 입력은 기본 비활성화한다. 화면 소리를 전달하려면 브라우저에서
탭 공유 시 **탭 오디오 공유**를 선택한다. 소리 재생은 학생의 상호작용이 필요할 수 있다.
교사의 음성 설명까지 송출하려면 교사가 Daily UI에서 마이크를 별도로 켜야 한다.
브라우저 전체화면은 학생이 **전체화면** 버튼을 눌러야 한다.

교사·학생 표시는 Daily `userData`와 테스트 코드로 구분하고, 현재 screen 상태를
관찰한다. 일회성 시작 메시지에 의존하지 않아 늦게 접속한 학생도 진행 중 시연을 표시한다.
iframe을 DOM에서 이동시키지 않고 CSS로 확장해 연결이 재시작되는 것을 방지한다.
시청 중 주변 폼·메모는 `inert` 처리하고 종료 후 포커스를 복원한다.

### MVP 권한 범위

`userData`와 테스트 코드는 인증 수단이 아니다. 실제 영상 방의 경계는 Daily 방 URL과
Daily 입장 토큰이다. 같은 Daily 방의 다른 테스트 코드도 방의 참가자이므로 **실험마다
별도 방을 사용한다**. 공개 테스트 방에서는 링크를 아는 참가자가 들어갈 수 있고 학생의
송출 권한이 서버에서 차단되지 않는다. 소규모 합의된 테스트에만 사용한다.

학생을 확실하게 시청 전용으로 제한하려면 비공개 방에 서버에서 발급한 학생 토큰을 사용한다.
학생 토큰에 `permissions.canSend: false`, `enable_screenshare: false`를 설정하고,
교사 토큰에 화면 공유 권한을 부여한다. 이 MVP는 API 키를 보관하거나 토큰을 발급하는
서버를 만들지 않는다. 운영 기능으로 전환할 때 LMS 인증과 연결한 별도 토큰 발급이 필요하다.

Daily JS `0.92.2`를 고정 CDN URL로 실제 모드 연결 시에만 불러온다.
Daily 계정의 사용량·참가자 제한·방 설정에 따라 연결 조건과 요금이 달라진다.
이 저장소에 Daily 방 URL·입장 토큰·API 키를 넣지 않는다. 토큰은 입력 후 메모리에서만
join에 사용하며 URL·로그·브라우저 저장소로 복사하지 않는다.

## 검증

```sh
node --test scripts/test-screen-share.mjs
npm run lint
npm run test:tenancy
npm run build
```

단위 테스트는 URL 검증, 토큰 없는 초대 링크, 공유 종료·교사 퇴장·늦은 입장,
테스트 코드 구분, 데모 메시지 만료, 운영 자산 미참조를 확인한다.

브라우저 검증을 재실행하려면 개발 서버를 5174 포트에서 띄우고 아래를 실행한다.
테스트 도구는 gitignore 대상 `.bkit`에만 설치하며 앱 의존성을 변경하지 않는다.
Windows에서는 설치된 Edge를 독립 headless 프로필로 사용한다. 다른 OS에서는
Playwright Chromium을 설치해야 한다. 다른 주소는 `SCREEN_SHARE_BASE_URL` 환경변수로 지정한다.

```sh
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
# 별도 터미널
npm install --prefix .bkit/screen-share-browser --no-package-lock --no-save playwright@1.63.0
node scripts/test-screen-share-browser.mjs
```

브라우저 테스트는 두 탭 동기화, 다른 코드 격리, 늦은 입장·새로고침,
종료·교사 연결 해제 시 메모 보존, 학생 나가기, 모의 Daily 참가자 이벤트,
iframe 유지, 오류 후 재연결, 취소된 이전 연결의 늦은 실패, 모바일 레이아웃을 확인한다.
스크린샷은 `.bkit/screen-share-browser/artifacts`에 저장한다.

실제 Daily 방에서 두 기기 연결·화면 캡처·영상/음성 수신은 방 URL과 입장 권한이 있어야
확인할 수 있다. 모의 SDK 테스트나 데모 성공은 실제 영상 전송 검증을 대체하지 않는다.

참고: [Daily Prebuilt](https://docs.daily.co/docs/prebuilt),
[화면 공유 시작](https://docs.daily.co/reference/daily-js/instance-methods/start-screen-share),
[참가자 이벤트](https://docs.daily.co/reference/daily-js/events/participant-events),
[입장 토큰](https://docs.daily.co/reference/rest-api/meeting-tokens).
