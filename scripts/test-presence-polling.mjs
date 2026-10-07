import { build } from 'esbuild'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const harness = { effects: [], states: [], calls: [], listeners: new Map(), now: 1_000_000 }
globalThis.presencePollingTest = harness
const original = {
  document: globalThis.document,
  window: globalThis.window,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  now: Date.now,
}
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (event, fn) => harness.listeners.set(`document:${event}`, fn),
  removeEventListener: (event, fn) => {
    if (harness.listeners.get(`document:${event}`) === fn) harness.listeners.delete(`document:${event}`)
  },
}
globalThis.window = {
  addEventListener: (event, fn) => harness.listeners.set(`window:${event}`, fn),
  removeEventListener: (event, fn) => {
    if (harness.listeners.get(`window:${event}`) === fn) harness.listeners.delete(`window:${event}`)
  },
}
globalThis.setInterval = (fn, delay) => { harness.interval = fn; harness.intervalDelay = delay; return 1 }
globalThis.clearInterval = () => { harness.interval = null }
Date.now = () => harness.now

fs.mkdirSync('.bkit', { recursive: true })
const output = path.resolve('.bkit/presence-polling-test.mjs')
try {
  await build({
    entryPoints: ['src/shared/presence.js'], outfile: output, bundle: true, format: 'esm', platform: 'node',
    plugins: [{
      name: 'presence-adapters', setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hooks' }))
        b.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: `
          const h = globalThis.presencePollingTest;
          export const useEffect = fn => h.effects.push(fn);
          export function useState(value) {
            const index = h.states.length; h.states.push(value);
            return [value, next => { h.states[index] = typeof next === 'function' ? next(h.states[index]) : next }];
          }
        ` }))
        b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'adapter' }))
        b.onLoad({ filter: /.*/, namespace: 'adapter' }, () => ({ contents: `
          export const supabase = { rpc(name) {
            const h = globalThis.presencePollingTest; h.calls.push(name);
            return { abortSignal() { return Promise.resolve(name === 'online_student_count' && h.failOnline
              ? { data: null, error: new Error('offline') }
              : { data: name === 'student_service_stats' ? { today: 23, total: 456, online: 7 }
                : name === 'online_student_count' ? 5 : null, error: null }) } };
          } };
        ` }))
      },
    }],
  })
  const { useStudentPresenceTrack, useOnlineStudentCount } = await import(pathToFileURL(output))
  assert.equal(useStudentPresenceTrack('student-a'), null)
  const cleanup = harness.effects[0]()
  const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
  await flush()
  assert.deepEqual(harness.calls, ['heartbeat', 'student_service_stats'])
  assert.equal(harness.states[0].data.online, 7)
  assert.equal(harness.intervalDelay, 30000)

  harness.now += 30000
  harness.interval()
  await flush()
  assert.deepEqual(harness.calls.slice(2), ['heartbeat'], 'the expensive totals are not counted every 30 seconds')

  harness.now += 30000
  harness.interval()
  await flush()
  assert.deepEqual(harness.calls.slice(3), ['heartbeat', 'student_service_stats'])

  globalThis.document.visibilityState = 'hidden'
  harness.now += 90000
  harness.interval()
  await flush()
  assert.equal(harness.calls.length, 5, 'hidden tabs do not poll')

  globalThis.document.visibilityState = 'visible'
  harness.listeners.get('document:visibilitychange')()
  await flush()
  assert.deepEqual(harness.calls.slice(5), ['heartbeat', 'student_service_stats'], 'returning to the tab refreshes stale totals')
  cleanup()
  assert.equal(harness.interval, null)
  assert.equal(harness.listeners.size, 0)
  harness.effects = []; harness.states = []; harness.calls = []
  assert.equal(useOnlineStudentCount('cohort-a'), 0)
  const cleanupAdmin = harness.effects[0]()
  await flush()
  assert.deepEqual(harness.calls, ['online_student_count'])
  assert.equal(harness.states[0].count, 5)
  assert.equal(harness.intervalDelay, 60000)
  globalThis.document.visibilityState = 'hidden'
  harness.now += 60000
  harness.interval()
  await flush()
  assert.equal(harness.calls.length, 1, 'hidden administrator tabs do not count online students')
  globalThis.document.visibilityState = 'visible'
  harness.failOnline = true
  harness.listeners.get('document:visibilitychange')()
  await flush()
  assert.equal(harness.calls.length, 2)
  assert.equal(harness.states[0].count, 5, 'a failed refresh retains the last online count')
  harness.failOnline = false
  harness.listeners.get('window:online')()
  await flush()
  assert.equal(harness.calls.length, 2, 'paired resume events share one online-count read')
  assert.equal(harness.states[0].count, 5)
  cleanupAdmin()
  assert.equal(harness.listeners.size, 0)
  console.log('PASS: student heartbeat remains 30 seconds; admin online count pauses hidden tabs, polls every 60 seconds and resumes safely')
} finally {
  Date.now = original.now
  globalThis.document = original.document
  globalThis.window = original.window
  globalThis.setInterval = original.setInterval
  globalThis.clearInterval = original.clearInterval
  delete globalThis.presencePollingTest
  fs.unlinkSync(output)
}
