import { LAB, DAILY_SDK, DEMO_LEASE_MS, normalizeRoom, normalizeSession, studentLink, activeTeachers, demoTeacherState } from './core.js';

const role = document.body.dataset.role;
const teacher = role === 'teacher';
const query = new URLSearchParams(location.search);
const id = crypto.randomUUID();
let call = null;
let channel = null;
let timer = null;
let joined = false;
let connecting = false;
let sharing = false;
let mode = 'demo';
let session = '';
let demoState = null;
let priorFocus = null;
let sdkPromise = null;
let generation = 0;
const students = new Map();

document.querySelector('#app').innerHTML = `
  <header class="top"><div class="top-inner"><div class="brand"><span class="brand-icon">AX</span> 화면 공유 실험실</div><span class="pill">${teacher ? '교사 · TEST 01' : '학생 · TEST 02'}</span></div></header>
  <main>
    <div id="workspace">
      <div class="intro"><div class="eyebrow">SCREEN SHARE / MVP</div><h1>${teacher ? '지금 보고 있는 화면을, 함께.' : '교사의 시연을 함께 봅니다.'}</h1><p class="muted">${teacher ? '학생이 연결한 뒤 공유를 시작하면 학생 화면에 시연이 자동으로 표시됩니다.' : '테스트 방에 먼저 연결하세요. 교사가 공유하면 시청 화면이 자동으로 열립니다.'}</p></div>
      <div class="grid">
        <div class="stack">
          <section class="card"><h2>테스트 연결</h2>
            <form id="connect-form">
              <label for="mode">테스트 방식</label><select id="mode"><option value="demo">동작 데모 · 같은 브라우저의 두 탭</option><option value="daily">실제 화면 공유 · Daily Prebuilt</option></select>
              <label for="session">테스트 코드</label><input id="session" maxlength="64" autocomplete="off" spellcheck="false" required>
              <div class="hint">교사와 학생이 같은 코드를 사용하세요. 데모는 같은 기기·브라우저·주소에서만 연결됩니다.</div>
              <div id="daily-fields" hidden><label for="room">Daily 테스트 방 URL</label><input id="room" type="url" placeholder="https://your-team.daily.co/lms-test" autocomplete="off" spellcheck="false">
                <label for="token">입장 토큰 <span class="muted">(비공개 방일 때)</span></label><input id="token" type="password" autocomplete="off" placeholder="이 참가자의 입장 토큰">
                <div class="hint">Daily API 키가 아닌 참가자별 토큰입니다. 저장하거나 학생 링크에 포함하지 않습니다.</div></div>
              <label for="name">테스트 이름</label><input id="name" maxlength="40" autocomplete="off">
              <div class="actions"><button id="connect" class="primary" type="submit">${teacher ? '교사 연결' : '연결하고 대기'}</button><button id="disconnect" type="button" disabled>연결 해제</button></div>
            </form>
            ${teacher ? '<div class="link-box"><label for="student-link">학생 초대 링크</label><input id="student-link" readonly placeholder="설정을 입력하면 링크가 만들어집니다."><div class="actions"><button id="copy-link" type="button">링크 복사</button><button id="open-student" type="button">학생 화면 열기</button></div></div>' : ''}
          </section>
          <div class="notice" id="mode-note"></div>
          <section class="card"><h2>연결 기록</h2><ul id="log" class="log" aria-live="polite"></ul></section>
        </div>
        <div class="stack">
          <div class="status-line"><span id="status" class="status" role="status">연결 전</span><span id="count" class="count">${teacher ? '접속 학생 0명' : '교사 공유 대기'}</span></div>
          <div id="stage-anchor"></div>
          ${teacher ? '<div class="card"><h2>시연 제어</h2><p class="muted">연결 후 시작하세요. 실제 모드에서는 브라우저가 공유할 탭·창·화면을 물어봅니다.</p><div class="actions"><button id="start" class="primary" disabled>화면 공유 시작</button><button id="stop" class="danger" disabled>공유 종료</button></div></div>' : '<section class="card lesson"><span class="lesson-tag">학생 화면 예시</span><h2>AI 도구 실습 노트</h2><p class="muted">공유가 시작되면 이 화면을 덮습니다. 공유 종료 후 작성 중인 내용이 그대로 남는지 확인하세요.</p><label for="notes">내 실습 메모</label><textarea id="notes" placeholder="공유 전에 메모를 적어보세요."></textarea></section>'}
        </div>
      </div>
      <p class="footer">운영 LMS와 연결되지 않는 독립 테스트입니다. 실제 영상은 Daily를 통해 전송되며 이용량은 Daily 계정에 반영됩니다. 테스트 방에는 운영 정보 대신 샘플 화면을 사용하세요.</p>
    </div>
  </main>
  <section id="call-shell" class="call-shell" aria-label="${teacher ? '교사 화면 공유 미리보기' : '교사 시연 시청'}">
    <div class="stage-header"><span id="stage-title" class="stage-title">${teacher ? '송출 미리보기' : '시연 대기실'}</span><div class="actions"><button id="fullscreen" type="button">전체화면</button>${teacher ? '' : '<button id="exit-view" type="button">테스트 나가기</button>'}</div></div>
    <div id="call-host" class="call-host"><div id="placeholder" class="placeholder"><span class="screen-icon" aria-hidden="true"></span><strong>연결을 기다리고 있습니다</strong><p>왼쪽에서 테스트 방에 연결하세요.</p></div></div>
  </section>`;

const $ = (selector) => document.querySelector(selector);
$('#stage-anchor').replaceWith($('#call-shell'));
// Never reparent a live iframe: moving it can reload the Daily connection.
// Disable only the surrounding UI while the existing stage expands via CSS.
const inertTargets = [...document.querySelectorAll('header.top, .intro, .grid > .stack:first-child, .status-line, .lesson, .footer')];
$('#session').value = query.get('session') || (teacher ? `demo-${id.slice(0, 8)}` : '');
$('#room').value = query.get('room') || '';
$('#name').value = teacher ? '테스트 교사' : '테스트 학생';
$('#mode').value = query.get('mode') === 'daily' || query.has('room') ? 'daily' : 'demo';

function log(text) {
  const row = document.createElement('li');
  row.textContent = `${new Date().toLocaleTimeString('ko-KR')} · ${text}`;
  $('#log').prepend(row);
  while ($('#log').children.length > 12) $('#log').lastElementChild.remove();
}

function status(text, kind = '') {
  $('#status').textContent = text;
  $('#status').dataset.kind = kind;
}

function placeholder(title, detail, demo = false) {
  const el = $('#placeholder');
  el.hidden = false;
  el.classList.toggle('demo-slide', demo);
  el.replaceChildren();
  const icon = document.createElement('span');
  icon.className = demo ? 'eyebrow' : 'screen-icon';
  icon.textContent = demo ? 'SCREEN SHARE / DEMO' : '';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = detail;
  el.append(icon, heading, text);
  if (demo) {
    const chip = document.createElement('span');
    chip.className = 'demo-chip';
    chip.textContent = '자동 표시 · 조작 차단 · 종료 후 복귀';
    el.append(chip);
  }
}

function controls() {
  for (const field of ['mode', 'session', 'room', 'token', 'name']) $(`#${field}`).disabled = joined || connecting;
  $('#connect').disabled = joined || connecting;
  $('#disconnect').disabled = !joined && !connecting;
  if (teacher) { $('#start').disabled = !joined || sharing; $('#stop').disabled = !joined || !sharing; }
}

function showShare(active) {
  const changed = sharing !== active;
  sharing = active;
  if (!teacher) {
    if (active && !document.body.classList.contains('student-live')) {
      priorFocus = document.activeElement;
      for (const element of inertTargets) element.inert = true;
      $('#call-shell').setAttribute('role', 'dialog');
      $('#call-shell').setAttribute('aria-modal', 'true');
      document.body.classList.add('student-live');
      $('#fullscreen').focus();
    } else if (!active && document.body.classList.contains('student-live')) {
      if (document.fullscreenElement === $('#call-shell')) document.exitFullscreen().catch(() => {});
      document.body.classList.remove('student-live');
      for (const element of inertTargets) element.inert = false;
      $('#call-shell').removeAttribute('role');
      $('#call-shell').removeAttribute('aria-modal');
      priorFocus?.focus();
      priorFocus = null;
    }
  }
  $('#stage-title').textContent = active ? (mode === 'demo' ? '동작 데모 · 실제 영상이 아닙니다' : 'LIVE · 교사 화면 공유') : (teacher ? '송출 미리보기' : '시연 대기실');
  if (mode === 'demo') placeholder(active ? '교사 시연이 시작되었습니다' : '교사 공유를 기다리고 있습니다', active ? '이 화면은 시작·종료 동작을 확인하는 데모입니다. 실제 브라우저 영상은 Daily 모드에서 공유됩니다.' : '교사 화면에서 공유 시작을 누르면 학생 화면이 자동으로 열립니다.', active);
  if (joined) status(active ? (mode === 'demo' ? '데모 시연 중' : '화면 공유 중') : '연결됨 · 공유 대기', 'ok');
  if (changed) log(active ? '공유 시작 · 학생 시청 화면 표시' : '공유 종료 · 기존 화면 복귀');
  controls();
}

function configChanged() {
  const daily = $('#mode').value === 'daily';
  $('#daily-fields').hidden = !daily;
  $('#room').required = daily;
  $('#mode-note').textContent = daily
    ? '실제 모드: Daily 대시보드에서 별도 테스트 방을 만들고 같은 URL로 연결하세요. 교사만 공유합니다. 학생 소리가 안 들리면 Daily 플레이어를 클릭하세요.'
    : '동작 데모: 영상 전송 없이 자동 표시·종료·복귀를 확인합니다. 교사가 만든 학생 링크를 같은 브라우저의 새 탭에서 여세요.';
  if (teacher) {
    try { $('#student-link').value = studentLink(location.href, { mode: $('#mode').value, session: $('#session').value, room: $('#room').value }); }
    catch { $('#student-link').value = ''; }
  }
}

function emit(type, extra = {}) {
  channel?.postMessage({ lab: LAB, session, sender: id, type, at: Date.now(), ...extra });
}

function demoHeartbeat() {
  const now = Date.now();
  if (teacher) {
    for (const [student, seen] of students) if (now - seen >= DEMO_LEASE_MS) students.delete(student);
    $('#count').textContent = `접속 학생 ${students.size}명`;
    emit('teacher-state', { active: sharing });
  } else {
    emit('student-heartbeat');
    if (demoState && now - demoState.at >= DEMO_LEASE_MS) {
      demoState = null;
      showShare(false);
      status('교사 연결 끊김 · 대기 중');
      log('교사 응답 만료 · 시청 화면 해제');
    }
  }
}

function connectDemo() {
  if (!globalThis.BroadcastChannel) throw new Error('이 브라우저는 동작 데모 연결을 지원하지 않습니다. Chrome 또는 Edge에서 테스트하세요.');
  channel = new BroadcastChannel(`${LAB}:${session}`);
  channel.onmessage = ({ data }) => {
    if (teacher) {
      if (data?.lab !== LAB || data.session !== session || typeof data.sender !== 'string') return;
      if (data.type === 'student-heartbeat') { students.set(data.sender, Date.now()); demoHeartbeat(); }
      if (data.type === 'student-left') { students.delete(data.sender); demoHeartbeat(); }
    } else {
      const state = demoTeacherState(data, session);
      if (!state || (demoState?.sender === state.sender && state.at < demoState.at)) return;
      demoState = state;
      showShare(state.active);
    }
  };
  joined = true;
  showShare(false);
  demoHeartbeat();
  timer = setInterval(demoHeartbeat, 2000);
}

function loadDaily() {
  if (globalThis.DailyIframe) return Promise.resolve(globalThis.DailyIframe);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = DAILY_SDK;
    script.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => fail(), 20000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error('Daily SDK를 불러오지 못했습니다. 인터넷 연결 후 다시 시도하세요.'));
    }
    script.onload = () => { clearTimeout(timeout); globalThis.DailyIframe ? resolve(globalThis.DailyIframe) : fail(); };
    script.onerror = fail;
    document.head.append(script);
  });
  return sdkPromise;
}

function syncDaily() {
  if (!call || !joined) return;
  const participants = call.participants();
  if (teacher) {
    $('#count').textContent = `접속 학생 ${Object.values(participants).filter((p) => !p.local && p.userData?.lab === LAB && p.userData?.role === 'student' && p.userData?.session === session).length}명`;
    showShare(participants.local?.screen === true);
  } else {
    const active = activeTeachers(participants, session);
    $('#count').textContent = active.length ? '교사 공유 수신 중' : '교사 공유 대기';
    showShare(active.length > 0);
  }
}

async function connectDaily(attempt) {
  const room = normalizeRoom($('#room').value);
  const token = $('#token').value.trim();
  const Daily = await loadDaily();
  if (generation !== attempt) return;
  const frame = Daily.createFrame($('#call-host'), {
    showLeaveButton: teacher,
    iframeStyle: { width: '100%', height: '100%', border: '0' },
    userData: { lab: LAB, role, session },
  });
  call = frame;
  frame.iframe().title = teacher ? 'Daily 교사 화면 공유' : 'Daily 학생 시청 화면';
  $('#placeholder').hidden = true;
  for (const event of ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped']) frame.on(event, () => { if (call === frame) syncDaily(); });
  frame.on('joined-meeting', () => {
    if (call !== frame) return;
    joined = true;
    connecting = false;
    status('연결됨 · 공유 대기', 'ok');
    log('Daily 방 연결 완료');
    syncDaily();
    controls();
  });
  frame.on('local-screen-share-started', () => { if (teacher && call === frame) showShare(true); });
  frame.on('local-screen-share-stopped', () => { if (teacher && call === frame) showShare(false); });
  frame.on('local-screen-share-canceled', () => { if (call === frame) { status('공유 선택을 취소했습니다. 다시 시작할 수 있습니다.'); controls(); } });
  frame.on('left-meeting', () => { if (call === frame) void disconnect('Daily 방에서 나왔습니다.'); });
  frame.on('error', () => { if (call === frame) void disconnect('Daily 연결 오류. 방 URL·토큰·네트워크를 확인하세요.', true); });
  const options = { url: room, userName: $('#name').value.trim() || (teacher ? '테스트 교사' : '테스트 학생'), startVideoOff: true, startAudioOff: true, audioSource: false, videoSource: false };
  if (token) options.token = token;
  await frame.join(options);
  // Never persist tokens in browser storage or invitation URLs.
  if (call === frame) $('#token').value = '';
  if (call === frame && joined) timer = setInterval(syncDaily, 2000);
}

async function disconnect(message = '연결을 해제했습니다.', error = false) {
  const cleanup = ++generation;
  const oldCall = call;
  call = null;
  if (channel) { emit(teacher ? 'teacher-state' : 'student-left', teacher ? { active: false } : {}); channel.close(); channel = null; }
  clearInterval(timer);
  timer = null;
  joined = false;
  connecting = Boolean(oldCall);
  demoState = null;
  students.clear();
  showShare(false);
  if (oldCall) {
    // Keep the frame attached until Daily completes its own cleanup. Removing
    // it first can interrupt the iframe messages needed to leave the room.
    const oldIframe = oldCall.iframe();
    try { await oldCall.destroy(); } catch { log('이전 Daily 프레임 정리 실패'); }
    finally { oldIframe?.remove(); }
  }
  if (generation !== cleanup) return;
  connecting = false;
  placeholder('연결을 기다리고 있습니다', '테스트 방에 다시 연결할 수 있습니다.');
  $('#count').textContent = teacher ? '접속 학생 0명' : '교사 공유 대기';
  status(message, error ? 'error' : '');
  log(message);
  controls();
}

$('#connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (joined || connecting) return;
  const attempt = ++generation;
  try {
    session = normalizeSession($('#session').value);
    mode = $('#mode').value;
    if (mode === 'daily') normalizeRoom($('#room').value);
    connecting = true;
    controls();
    status('연결 중…');
    if (mode === 'demo') { connectDemo(); connecting = false; controls(); log('동작 데모 연결 완료'); }
    else await connectDaily(attempt);
  } catch (error) { if (generation === attempt) await disconnect(error.message || '연결에 실패했습니다.', true); }
});
$('#disconnect').addEventListener('click', () => { void disconnect(); });
$('#mode').addEventListener('change', configChanged);
for (const field of ['session', 'room']) $(`#${field}`).addEventListener('input', configChanged);
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('#call-shell').requestFullscreen();
  } catch { log('이 브라우저에서는 전체화면 전환을 사용할 수 없습니다.'); }
});

if (teacher) {
  $('#start').addEventListener('click', () => {
    if (!joined || sharing) return;
    if (mode === 'demo') { showShare(true); demoHeartbeat(); }
    else {
      try { call.startScreenShare(); status('브라우저에서 공유할 탭·창·화면을 선택하세요.'); }
      catch { status('화면 공유를 시작할 수 없습니다. 방의 공유 권한을 확인하세요.', 'error'); }
    }
  });
  $('#stop').addEventListener('click', () => {
    if (mode === 'demo') { showShare(false); demoHeartbeat(); }
    else { try { call?.stopScreenShare(); } catch { status('공유 종료에 실패했습니다. Daily의 종료 버튼을 사용하세요.', 'error'); } }
  });
  $('#open-student').addEventListener('click', () => {
    configChanged();
    if ($('#student-link').value) window.open($('#student-link').value, '_blank', 'noopener,noreferrer');
    else status('테스트 코드와 방 URL을 먼저 확인하세요.', 'error');
  });
  $('#copy-link').addEventListener('click', async () => {
    configChanged();
    if (!$('#student-link').value) { status('테스트 코드와 방 URL을 먼저 확인하세요.', 'error'); return; }
    try { await navigator.clipboard.writeText($('#student-link').value); log('학생 링크 복사 완료'); }
    catch { $('#student-link').focus(); $('#student-link').select(); log('링크를 선택했습니다. 직접 복사하세요.'); }
  });
} else $('#exit-view').addEventListener('click', () => { void disconnect('학생 테스트에서 나왔습니다.'); });

window.addEventListener('pagehide', () => {
  if (channel) { emit(teacher ? 'teacher-state' : 'student-left', teacher ? { active: false } : {}); channel.close(); }
  clearInterval(timer);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined) { if (mode === 'demo') demoHeartbeat(); else syncDaily(); }
});
configChanged();
controls();
log('독립 테스트 화면 준비 완료');
