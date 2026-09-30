// Optional isolated browser harness. Does not use the user's browser profile.
// Setup: npm install --prefix .bkit/screen-share-browser --no-package-lock --no-save playwright
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LAB, DAILY_SDK } from '../public/screen-share-test/core.js';

const { chromium } = await import('../.bkit/screen-share-browser/node_modules/playwright/index.mjs');
const base = process.env.SCREEN_SHARE_BASE_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
const artifactDir = '.bkit/screen-share-browser/artifacts';
fs.mkdirSync(artifactDir, { recursive: true });
const live = (page, value) => page.waitForFunction((active) => document.body.classList.contains('student-live') === active, value);
const open = async (path) => { const page = await context.newPage(); await page.goto(`${base}/${path}`); await page.locator('#connect').waitFor(); return page; };

// Implements only the documented Daily surface used by the MVP. Media is NOT
// simulated as proof of a real Daily connection; these tests exercise app logic.
const fakeDaily = `
window.__dailyFrames = [];
window.DailyIframe = {
  createFrame(host, options) {
    const listeners = new Map();
    const iframe = document.createElement('iframe');
    iframe.srcdoc = '<body style="background:#192e4b;color:white;font-family:sans-serif">Daily mock player</body>';
    host.append(iframe);
    const peers = { local: { local: true, screen: false, userData: options.userData } };
    const emit = (name) => { for (const fn of listeners.get(name) || []) fn({}); };
    const frame = {
      options, peers, destroyed: false, joinOptions: null,
      on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); return frame; },
      iframe: () => iframe,
      participants: () => peers,
      async join(opts) {
        frame.joinOptions = opts;
        if (window.__delayJoin) await new Promise((resolve, reject) => { frame.resolveJoin = resolve; frame.rejectJoin = reject; });
        if (!frame.destroyed) emit('joined-meeting');
      },
      startScreenShare() { peers.local.screen = true; emit('local-screen-share-started'); emit('participant-updated'); },
      stopScreenShare() { peers.local.screen = false; emit('local-screen-share-stopped'); emit('participant-updated'); },
      async destroy() { frame.destroyed = true; iframe.remove(); emit('left-meeting'); },
      setRemote(p) { if (p) peers.remote = p; else delete peers.remote; emit('participant-updated'); },
      fail() { emit('error'); },
    };
    window.__dailyFrames.push(frame);
    return frame;
  },
};`;

try {
  const teacher = await open('test01.html?mode=demo&session=browser-test');
  const student = await open('test02.html?mode=demo&session=browser-test');
  const other = await open('test02.html?mode=demo&session=other-test');
  await teacher.locator('#connect').click();
  await student.locator('#connect').click();
  await other.locator('#connect').click();
  await student.locator('#notes').fill('작성 중인 메모는 유지되어야 합니다.');
  await teacher.waitForFunction(() => document.querySelector('#count').textContent === '접속 학생 1명');
  await teacher.screenshot({ path: `${artifactDir}/teacher.png`, fullPage: true });
  await teacher.locator('#start').click();
  await live(student, true);
  await live(other, false);
  assert.equal(await student.locator('.lesson').evaluate((el) => el.inert), true);
  const bounds = await student.locator('#call-shell').boundingBox();
  assert.equal(bounds.x, 0);
  assert.equal(bounds.y, 0);
  assert.equal(bounds.width, 1440);
  await student.screenshot({ path: `${artifactDir}/student-live.png` });
  console.log('PASS: two-tab start, student control blocking and test-code isolation');

  const late = await open('test02.html?mode=demo&session=browser-test');
  await late.locator('#connect').click();
  await live(late, true);
  await late.reload();
  await late.locator('#connect').click();
  await live(late, true);
  console.log('PASS: late join and refresh recover current demo sharing');

  await teacher.locator('#stop').click();
  await live(student, false);
  await live(late, false);
  assert.equal(await student.locator('#notes').inputValue(), '작성 중인 메모는 유지되어야 합니다.');
  assert.equal(await student.locator('.lesson').evaluate((el) => el.inert), false);
  await student.screenshot({ path: `${artifactDir}/student-restored.png`, fullPage: true });
  await teacher.locator('#start').click();
  await live(student, true);
  await teacher.locator('#disconnect').click();
  await live(student, false);
  console.log('PASS: share stop and teacher disconnect restore student notes');

  await teacher.locator('#connect').click();
  await teacher.locator('#start').click();
  await live(student, true);
  await student.locator('#exit-view').click();
  await live(student, false);
  assert.match(await student.locator('#status').textContent(), /나왔습니다/);
  console.log('PASS: student can leave viewing without losing notes');
  for (const page of [teacher, student, other, late]) await page.close();

  await context.route(DAILY_SDK, (route) => route.fulfill({ contentType: 'application/javascript', body: fakeDaily }));
  const dailyStudent = await open('test02.html?mode=daily&session=daily-test&room=https%3A%2F%2Flab.daily.co%2Fmvp');
  await dailyStudent.locator('#token').fill('test-student-token');
  await dailyStudent.locator('#connect').click();
  await dailyStudent.waitForFunction(() => document.querySelector('#status').textContent.includes('연결됨'));
  assert.equal(await dailyStudent.locator('#token').inputValue(), '');
  assert.deepEqual(await dailyStudent.evaluate(() => { const opts = window.__dailyFrames[0].joinOptions; return [opts.startVideoOff, opts.startAudioOff, opts.audioSource, opts.videoSource]; }), [true, true, false, false]);
  const remote = { local: false, screen: true, userData: { lab: LAB, role: 'teacher', session: 'daily-test' } };
  await dailyStudent.evaluate((p) => window.__dailyFrames[0].setRemote(p), remote);
  await live(dailyStudent, true);
  await dailyStudent.evaluate(() => { window.__originalIframe = document.querySelector('#call-host iframe'); });
  const originalSource = await dailyStudent.locator('#call-host iframe').getAttribute('srcdoc');
  await dailyStudent.evaluate(() => window.__dailyFrames[0].setRemote(null));
  await live(dailyStudent, false);
  assert.equal(await dailyStudent.evaluate(() => window.__originalIframe === document.querySelector('#call-host iframe')), true);
  assert.equal(await dailyStudent.locator('#call-host iframe').getAttribute('srcdoc'), originalSource);
  console.log('PASS: Daily participant share/departure and stable iframe without reconnection');

  await dailyStudent.evaluate((p) => window.__dailyFrames[0].setRemote(p), { ...remote, userData: { ...remote.userData, role: 'student' } });
  await live(dailyStudent, false);
  await dailyStudent.evaluate((p) => window.__dailyFrames[0].setRemote(p), { ...remote, userData: { ...remote.userData, session: 'other-test' } });
  await live(dailyStudent, false);
  await dailyStudent.evaluate(() => window.__dailyFrames[0].fail());
  await dailyStudent.waitForFunction(() => !document.querySelector('#connect').disabled);
  assert.equal(await dailyStudent.locator('#call-host iframe').count(), 0);
  assert.match(await dailyStudent.locator('#status').textContent(), /연결 오류/);
  await dailyStudent.locator('#connect').click();
  await dailyStudent.waitForFunction(() => window.__dailyFrames.length === 2 && !document.querySelector('#disconnect').disabled);
  console.log('PASS: other roles/sessions ignored; Daily errors allow clean reconnect');

  await dailyStudent.locator('#disconnect').click();
  await dailyStudent.waitForFunction(() => !document.querySelector('#connect').disabled);
  await dailyStudent.evaluate(() => { window.__delayJoin = true; });
  await dailyStudent.locator('#connect').click();
  await dailyStudent.waitForFunction(() => window.__dailyFrames.length === 3);
  await dailyStudent.locator('#disconnect').click();
  await dailyStudent.waitForFunction(() => !document.querySelector('#connect').disabled);
  await dailyStudent.evaluate(() => { window.__delayJoin = false; });
  await dailyStudent.locator('#connect').click();
  await dailyStudent.waitForFunction(() => window.__dailyFrames.length === 4 && document.querySelector('#status').textContent.includes('연결됨'));
  await dailyStudent.evaluate(() => window.__dailyFrames[2].rejectJoin(new Error('stale attempt')));
  assert.equal(await dailyStudent.locator('#call-host iframe').count(), 1);
  assert.match(await dailyStudent.locator('#status').textContent(), /연결됨/);
  console.log('PASS: canceled old join cannot tear down a newer Daily session');
  await dailyStudent.close();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${base}/test01.html`);
  await mobile.locator('#connect').waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: `${artifactDir}/teacher-mobile.png`, fullPage: true });
  await mobile.close();
  console.log('PASS: mobile layout has no horizontal overflow');
  assert.deepEqual(errors, [], 'browser JavaScript errors');
  console.log('PASS: no browser JavaScript errors; screenshots saved under ' + artifactDir);
} finally {
  await context.close();
  await browser.close();
}
