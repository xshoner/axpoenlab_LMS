import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { LAB, DEMO_LEASE_MS, normalizeRoom, normalizeSession, studentLink, activeTeachers, demoTeacherState } from '../public/screen-share-test/core.js';

test('room URLs are HTTPS Daily rooms; secrets and foreign embeds are rejected', () => {
  assert.equal(normalizeRoom(' https://lab.daily.co/test-room/ '), 'https://lab.daily.co/test-room');
  for (const url of ['http://lab.daily.co/test', 'https://evil.example/test', 'https://lab.daily.co.evil.example/test', 'https://lab.daily.co/test?t=secret', 'https://lab.daily.co/test#secret', 'https://user:secret@lab.daily.co/test', 'https://lab.daily.co:444/test', 'javascript:alert(1)', 'https://daily.co/test', 'https://lab.daily.co/']) {
    assert.throws(() => normalizeRoom(url), undefined, url);
  }
});

test('invitations preserve room and session but never forward teacher tokens or old query strings', () => {
  const url = new URL(studentLink('http://localhost:5173/test01.html?token=teacher-secret#secret', { mode: 'daily', session: 'class-01', room: 'https://lab.daily.co/test' }));
  assert.equal(url.pathname, '/test02.html');
  assert.equal(url.searchParams.get('room'), 'https://lab.daily.co/test');
  assert.equal(url.searchParams.get('session'), 'class-01');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(url.hash, '');
  assert.throws(() => normalizeSession('<script>'));
  assert.throws(() => normalizeSession('abc'));
});

const participant = (overrides = {}) => ({ local: false, screen: true, userData: { lab: LAB, role: 'teacher', session: 'class-01' }, ...overrides });

test('late joiners recover a current share from participant state without start messages', () => {
  const sharing = participant();
  assert.deepEqual(activeTeachers({ local: participant({ local: true }), teacher: sharing }, 'class-01'), [sharing]);
  assert.equal(activeTeachers({ teacher: participant({ screen: false, tracks: { screenVideo: { state: 'playable' } } }) }, 'class-01').length, 1);
});

test('share stop, teacher departure, other sessions and student sharing do not leave a live overlay', () => {
  const peers = {
    stopped: participant({ screen: false, tracks: { screenVideo: { state: 'off' } } }),
    student: participant({ userData: { lab: LAB, role: 'student', session: 'class-01' } }),
    outsider: participant({ userData: { lab: 'other-app', role: 'teacher', session: 'class-01' } }),
    otherSession: participant({ userData: { lab: LAB, role: 'teacher', session: 'class-02' } }),
  };
  assert.equal(activeTeachers(peers, 'class-01').length, 0);
  assert.equal(activeTeachers({}, 'class-01').length, 0);
});

test('demo state rejects stale, malformed, unrelated or future messages', () => {
  const now = 100000;
  const state = { lab: LAB, session: 'class-01', sender: 'teacher-a', type: 'teacher-state', active: true, at: now };
  assert.deepEqual(demoTeacherState(state, 'class-01', now), { sender: 'teacher-a', active: true, at: now });
  for (const bad of [null, {}, { ...state, active: 'true' }, { ...state, at: now - DEMO_LEASE_MS }, { ...state, at: now + 10000 }, { ...state, at: NaN }, { ...state, type: 'student-heartbeat' }, { ...state, lab: 'lms-production' }]) assert.equal(demoTeacherState(bad, 'class-01', now), null);
  assert.equal(demoTeacherState(state, 'other-class', now), null);
});

test('test pages use only isolated assets and do not touch production auth, storage or database', () => {
  for (const page of ['test01.html', 'test02.html']) {
    const html = fs.readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /screen-share-test\/lab\.js/);
    assert.doesNotMatch(html, /src\/|supabase|admin\.html/);
  }
  const js = fs.readFileSync(new URL('../public/screen-share-test/lab.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /supabase|localStorage|sessionStorage|service_role|fetch\(/);
});
