import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScreenShareClient } from '../src/shared/screenShareClient.js'

const session = () => ({ id: crypto.randomUUID(), teacher_id: 'teacher', cohort_id: 'cohort', state: 'live', lease_until: new Date(Date.now()+45000).toISOString() })
function fixture(teacher = false) {
  const log = [], listeners = new Map(), frames = []
  let s = session()
  const track = { readyState: 'live', addEventListener() {}, stop() { this.readyState = 'ended'; log.push('capture-stop') } }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const client = new ScreenShareClient({ teacher,
    onChange() {}, capture: async () => { log.push('capture'); return stream },
    api: async action => { log.push(action); return action === 'stop' ? {} : { session:s, room:'https://test.daily.co/room', token:'test' } },
    loadDaily: async () => { log.push('load-sdk'); return { createCallObject(opts) {
      const call = { opts, participants: () => ({}), on(name,fn) { listeners.set(name,fn) }, once(name,fn) { listeners.set(name,fn) },
        join: async options => { call.joinOptions=options; log.push('join') },
        startScreenShare(options) { call.shareOptions=options; log.push('share'); listeners.get('local-screen-share-started')() },
        async destroy() { log.push('destroy'); listeners.get('left-meeting')?.({}) },
      }
      frames.push(call); return call
    } } },
  })
  return { client, log, frames, stream, listeners, session:s }
}

test('idle/login does not load Daily, issue tokens, request capture or join', async () => {
  for (const teacher of [false,true]) {
    const f = fixture(teacher)
    await f.client.receive(null)
    assert.deepEqual(f.log, [])
  }
})
test('only teacher click captures, then joins; activation is published after media starts', async () => {
  const f = fixture(true)
  await f.client.start('cohort')
  assert.deepEqual(f.log, ['capture','start','load-sdk','join','share','activate'])
  assert.equal(f.frames[0].shareOptions.mediaStream, f.stream)
  assert.equal(f.frames[0].joinOptions.audioSource, false)
  assert.equal(f.frames[0].joinOptions.videoSource, false)
  await f.client.end()
  assert.equal(f.log.filter(x=>x==='stop').length,1)
  assert.equal(f.frames.length,1)
  assert.equal(f.client.call,null)
  assert.equal(f.client.snapshot.phase,'idle')
})
test('canceling capture never admits anyone into Daily', async () => {
  const f = fixture(true)
  f.client.capture = async () => { throw Object.assign(new Error('cancel'),{name:'NotAllowedError'}) }
  await f.client.start('cohort')
  assert.deepEqual(f.log, [])
  assert.equal(f.client.call,null)
})
test('student joins only a live unexpired share and destroys connection on end', async () => {
  const f = fixture()
  await f.client.receive({...f.session,state:'starting'})
  await f.client.receive({...f.session,lease_until:new Date(0).toISOString()})
  assert.deepEqual(f.log, [])
  await f.client.receive(f.session)
  assert.deepEqual(f.log,['token','load-sdk','join'])
  await f.client.receive({...f.session,lease_until:new Date(Date.now()+45000).toISOString()})
  assert.equal(f.frames.length,1,'heartbeat must not create another billed connection')
  await f.client.receive(null)
  assert.equal(f.client.call,null)
  assert.equal(f.log.at(-1),'destroy')
  assert.ok(!f.log.includes('stop'),'students cannot terminate the lesson')
})
test('a late token response after share ends cannot create a billed connection', async () => {
  const f = fixture()
  let resolve
  f.client.api = () => new Promise(r=>{resolve=r})
  const waiting = f.client.receive(f.session)
  await new Promise(r=>setImmediate(r))
  await f.client.receive(null)
  resolve({session:f.session,room:'https://test.daily.co/room',token:'stale'})
  await waiting
  assert.equal(f.frames.length,0)
})
test('teacher departure disconnects students and never rejoins the empty old room', async () => {
  const f = fixture()
  await f.client.receive(f.session)
  f.listeners.get('participant-left')({participant:{user_id:'teacher'}})
  await new Promise(r=>setImmediate(r))
  await f.client.receive(f.session)
  assert.equal(f.frames.length,1)
  assert.equal(f.client.call,null)
})
