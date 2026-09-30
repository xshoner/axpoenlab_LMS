export const LAB = 'ax-screen-share-test-v1';
export const DAILY_SDK = 'https://unpkg.com/@daily-co/daily-js@0.92.2/dist/daily.js';
export const DEMO_LEASE_MS = 8000;

export function normalizeRoom(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Daily 방의 HTTPS URL을 입력하세요.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.daily\.co$/i.test(url.hostname)
      || url.username || url.password || url.port || !/^\/[a-z0-9_-]+\/?$/i.test(url.pathname)
      || url.search || url.hash) {
    throw new Error('https://팀이름.daily.co/방이름 형식만 사용할 수 있습니다. 토큰은 별도 입력하세요.');
  }
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

export function normalizeSession(value) {
  const session = value.trim();
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(session)) throw new Error('테스트 코드는 영문·숫자·_- 조합으로 4~64자 입력하세요.');
  return session;
}

export function studentLink(base, { mode, session, room }) {
  const url = new URL('./test02.html', base);
  url.searchParams.set('mode', mode);
  url.searchParams.set('session', normalizeSession(session));
  if (mode === 'daily') url.searchParams.set('room', normalizeRoom(room));
  return url.href;
}

// A real share is derived from current Daily participant state, not a one-shot
// start message. Late joiners and students refreshing during a share recover it.
// userData is an MVP label, NOT an authentication or permission boundary.
export function activeTeachers(participants, session) {
  return Object.values(participants || {}).filter((p) => p && !p.local
    && p.userData?.lab === LAB && p.userData?.role === 'teacher'
    && p.userData?.session === session
    && (p.screen === true || ['loading', 'playable', 'interrupted'].includes(p.tracks?.screenVideo?.state)));
}

export function demoTeacherState(data, session, now = Date.now()) {
  if (!data || data.lab !== LAB || data.session !== session || data.type !== 'teacher-state'
    || typeof data.sender !== 'string' || data.sender.length > 100
    || typeof data.active !== 'boolean' || !Number.isFinite(data.at)
    || data.at > now + 2000 || now - data.at >= DEMO_LEASE_MS) return null;
  return { sender: data.sender, active: data.active, at: data.at };
}
