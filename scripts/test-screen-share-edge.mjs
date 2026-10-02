import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transform } from 'esbuild'

const ids = Object.fromEntries(['super','admin','student','other','inactive','cohort','otherCohort','client'].map(k=>[k,crypto.randomUUID()]))
const profiles = [
  {id:ids.super,role:'super_admin',status:'active'}, {id:ids.admin,role:'admin',status:'active'},
  {id:ids.student,role:'student',status:'active'}, {id:ids.other,role:'student',status:'active'},
  {id:ids.inactive,role:'super_admin',status:'inactive'},
]
const rows = {profiles,cohorts:[{id:ids.cohort,deleted_at:null}],cohort_members:[{user_id:ids.student,cohort_id:ids.cohort},{user_id:ids.other,cohort_id:ids.otherCohort}],screen_share_sessions:[]}
const traffic=[]
let presence=[{id:'teacher-connection'},{id:'student-connection'}]
const db={auth:{getUser:async id=>({data:{user:profiles.some(p=>p.id===id)?{id}:null}})},
  from(table) {
    const filters=[], q={
      select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
      single(){return q},maybeSingle(){return q},update(patch){q.patch=patch;return q},
      then(resolve,reject){const matches=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(q.patch)matches.forEach(r=>Object.assign(r,q.patch));return Promise.resolve({data:matches[0]||null}).then(resolve,reject)},
    };return q
  },
  async rpc(name,opts){
    if(name==='screen_share_claim'){
      if(rows.screen_share_sessions.some(s=>s.state!=='ended')) return {error:{message:'screen_share_busy'}}
      const s={id:crypto.randomUUID(),teacher_id:opts.p_teacher,cohort_id:opts.p_cohort,client_id:opts.p_client,state:'starting',lease_until:new Date(Date.now()+45000).toISOString()}
      rows.screen_share_sessions.push(s);return {data:s}
    }
    if(name==='screen_share_reserve_token') return {data:rows.screen_share_sessions.some(s=>s.id===opts.p_session&&['starting','live'].includes(s.state))}
    if(name==='screen_share_lock_stop') {
      const s=rows.screen_share_sessions.find(s=>s.state!=='ended'&&(!opts.p_session||s.id===opts.p_session)&&(!opts.p_expired||Date.parse(s.lease_until)<=Date.now())&&(s.state!=='stopping'||Date.parse(s.lease_until)<=Date.now()))
      if(s){s.state='stopping';s.lease_until=new Date(Date.now()+120000).toISOString()}
      return {data:s||null}
    }
    if(name==='screen_share_sample') {const s=rows.screen_share_sessions.find(s=>s.id===opts.p_session);if(s)s.participant_count=opts.p_count}
    return {data:null}
  },
}
const fakeFetch=async (url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):undefined;traffic.push({path:new URL(url).pathname,body})
  if(url.endsWith('/eject'))presence=presence.filter(p=>!body.ids.includes(p.id))
  return new Response(JSON.stringify(url.endsWith('/meeting-tokens')?{token:'signed-test'}:url.endsWith('/presence')?{total_count:presence.length,data:presence}:{}),{status:200})
}
const source=fs.readFileSync('supabase/functions/screen-share/index.ts','utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace(/^Deno\.serve[^\n]+\n?$/m,'')
const {code}=await transform(source,{loader:'ts',target:'es2022'})
const create=new Function(`${code};return createScreenShareHandler;`)()
const serve=create(db,()=> 'private-api-key',fakeFetch)
async function invoke(who,body,view){const response=await serve(new Request('https://test.local',{method:'POST',headers:{Authorization:`Bearer ${ids[who]||who}`,'Content-Type':'application/json',...(view?{'x-admin-view':ids.admin}:{})},body:JSON.stringify(body)}));return {status:response.status,...await response.json()}}
for(const who of ['admin','student','other','inactive','missing']){
  const r=await invoke(who,{action:'start',cohort_id:ids.cohort,client_id:ids.client})
  assert.ok([401,403].includes(r.status))
}
assert.equal((await invoke('super',{action:'start',cohort_id:ids.cohort,client_id:ids.client},true)).status,403)
assert.equal(traffic.length,0,'unauthorized users must never use Daily APIs')
const started=await invoke('super',{action:'start',cohort_id:ids.cohort,client_id:ids.client})
assert.equal(started.status,200)
assert.equal(started.session.state,'starting')
const sid=started.session.id
assert.equal((await invoke('student',{action:'token',session_id:sid})).status,409)
assert.equal((await invoke('super',{action:'activate',session_id:sid,client_id:crypto.randomUUID()})).status,409)
presence=[{id:'teacher-connection'},{id:'student-connection'}]
assert.equal((await invoke('super',{action:'activate',session_id:sid,client_id:ids.client})).status,200)
assert.equal(rows.screen_share_sessions[0].participant_count,2,'Daily total_count must drive usage sampling')
assert.equal((await invoke('other',{action:'token',session_id:sid})).status,403)
assert.equal((await invoke('admin',{action:'token',session_id:sid})).status,403)
assert.equal((await invoke('student',{action:'stop',session_id:sid})).status,403)
assert.equal((await invoke('student',{action:'token',session_id:sid})).status,200)
const tokens=traffic.filter(r=>r.path.endsWith('/meeting-tokens'))
assert.deepEqual(tokens[0].body.properties.permissions.canSend,['screenVideo'])
assert.equal(tokens[1].body.properties.permissions.canSend,false)
assert.equal(tokens[1].body.properties.enable_screenshare,false)
assert.ok(!('eject_at_token_exp' in tokens[1].body.properties),'token must not override room expiry')
assert.equal((await invoke('super',{action:'stop',session_id:sid})).status,200)
assert.equal(rows.screen_share_sessions[0].state,'ended')
assert.ok(traffic.some(r=>r.path.endsWith('/eject')&&r.body.ids.includes('student-connection')))
assert.equal((await invoke('student',{action:'token',session_id:sid})).status,409)
const before=traffic.length
await invoke('super',{action:'stop',session_id:sid})
assert.equal(traffic.length,before,'stale stop must not affect a later room session')
console.log('PASS: actual Edge handler enforces super-admin, cohort, client ownership, no audio, no idle tokens and server ejection')
const workerServe=create(db,()=> 'private-api-key',fakeFetch,()=> 'watchdog-key')
async function sweep(key){const r=await workerServe(new Request('https://test.local',{method:'POST',headers:{'x-screen-share-worker':key,'Content-Type':'application/json'},body:'{"action":"sweep"}'}));return {status:r.status,...await r.json()}}
assert.equal((await sweep('forged-key')).status,401)
assert.equal((await sweep('watchdog-key')).cleaned,false)
rows.screen_share_sessions.push({id:crypto.randomUUID(),state:'live',lease_until:new Date(Date.now()-1000).toISOString()})
presence=[{id:'frozen-student-connection'}]
assert.equal((await sweep('watchdog-key')).cleaned,true)
assert.equal(presence.length,0)
assert.equal(rows.screen_share_sessions.at(-1).state,'ended')
console.log('PASS: authenticated internal watchdog ignores healthy shares and clears expired server participants')
