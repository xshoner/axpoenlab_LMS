import assert from 'node:assert/strict'
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const harness = { effects: [], calls: [], listeners: new Map(), now: 1_000_000, hidden: false }
globalThis.inboxPollingTest = harness
const original = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage,
  setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, now: Date.now }
globalThis.document = {
  get hidden() { return harness.hidden },
  addEventListener: (event, fn) => harness.listeners.set(`document:${event}`, fn),
  removeEventListener: (event, fn) => { if (harness.listeners.get(`document:${event}`) === fn) harness.listeners.delete(`document:${event}`) },
}
globalThis.window = {
  addEventListener: (event, fn) => harness.listeners.set(`window:${event}`, fn),
  removeEventListener: (event, fn) => { if (harness.listeners.get(`window:${event}`) === fn) harness.listeners.delete(`window:${event}`) },
}
globalThis.localStorage = { getItem: () => null }
globalThis.setInterval = (fn, delay) => { harness.interval = fn; harness.intervalDelay = delay; return 1 }
globalThis.clearInterval = () => { harness.interval = null }
Date.now = () => harness.now

const stubs = {
  react: `const h=globalThis.inboxPollingTest;
    export const lazy=()=>()=>null, Suspense=({children})=>children;
    export const useEffect=fn=>h.effects.push(fn), useRef=value=>({current:value});
    export const useState=value=>[typeof value==='function'?value():value,()=>{}];`,
  'react/jsx-runtime': 'export const jsx=()=>null,jsxs=()=>null,Fragment=()=>null;',
  '@tabler/icons-react': 'export const IconMail=()=>null,IconDownload=()=>null,IconTrash=()=>null;',
  '../lib/supabase': `const h=globalThis.inboxPollingTest;
    export const supabase={
      from(name){const query={select(){return this},eq(){return this},is(){return this},order(){return this},range(){return this},limit(){return this},
        then(resolve,reject){h.calls.push(name);return Promise.resolve({data:[]}).then(resolve,reject)}};return query},
      channel(){return {on(){return this},subscribe(callback){h.status=callback;return this}}},
      removeChannel(){},rpc(){return Promise.resolve({data:null})}
    };`,
  './auth': `export const useAuth=()=>({profile:{id:'student-a'}});`,
  './ui': `export const Dialog=()=>null,ConfirmDialog=()=>null,useToast=()=>()=>{};`,
  '../lib/helpers': `export const createDownloadUrl=()=>'',fmtBytes=()=>'',fmtDate=()=>'';`,
  './push': `export const PushBody=()=>null,LegacyAction=()=>null;`,
  './FileSenderDialog': `export default function FileSenderDialog(){return null}`,
}
fs.mkdirSync('.bkit', { recursive: true })
const output = path.resolve('.bkit/inbox-polling-test.mjs')
try {
  await build({ entryPoints: ['src/shared/fileTransfers.jsx'], outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
    plugins: [{ name: 'inbox-adapters', setup(b) {
      b.onResolve({ filter: /^(react|react\/jsx-runtime|@tabler\/icons-react|\.\.\/lib\/supabase|\.\/auth|\.\/ui|\.\.\/lib\/helpers|\.\/push|\.\/FileSenderDialog)$/ }, args => ({ path: args.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path] }))
    } }],
  })
  const { StudentDistributionInbox } = await import(pathToFileURL(output))
  StudentDistributionInbox({})
  const cleanup = harness.effects[2]()
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  await flush()
  assert.deepEqual(harness.calls, ['file_recipients', 'push_deliveries', 'push_hidden'])
  assert.equal(harness.intervalDelay, 30000)

  harness.status('SUBSCRIBED')
  await flush()
  assert.equal(harness.calls.length, 6, 'subscription catches deliveries between the initial read and realtime connection')
  for (let i = 0; i < 3; i++) { harness.now += 30000; harness.interval(); await flush() }
  assert.equal(harness.calls.length, 6, 'healthy realtime avoids repeated 30-second inbox reads')
  harness.now += 30000; harness.interval(); await flush()
  assert.equal(harness.calls.length, 9, 'a connected inbox reconciles after two minutes')

  harness.status('CHANNEL_ERROR')
  harness.now += 30000; harness.interval(); await flush()
  assert.equal(harness.calls.length, 12, 'lost realtime restores the 30-second fallback')
  harness.hidden = true
  harness.now += 30000; harness.interval(); await flush()
  assert.equal(harness.calls.length, 12, 'hidden tabs pause fallback reads')
  harness.hidden = false
  harness.listeners.get('document:visibilitychange')(); await flush()
  assert.equal(harness.calls.length, 15, 'returning to the tab refreshes missed deliveries')
  harness.listeners.get('window:focus')(); await flush()
  assert.equal(harness.calls.length, 15, 'paired visibility and focus events share one refresh')
  cleanup()
  assert.equal(harness.interval, null)
  assert.equal(harness.listeners.size, 0)
  console.log('PASS: inbox keeps realtime gap recovery, cuts connected fallback reads by 75%, and restores offline polling')
} finally {
  Date.now = original.now
  globalThis.document = original.document
  globalThis.window = original.window
  globalThis.localStorage = original.localStorage
  globalThis.setInterval = original.setInterval
  globalThis.clearInterval = original.clearInterval
  delete globalThis.inboxPollingTest
  fs.rmSync(output, { force: true })
}
