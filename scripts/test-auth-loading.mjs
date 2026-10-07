import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Execute the actual provider with controlled asynchronous auth/DB responses.
const harness={states:[],effects:[],pending:[],timers:[],reports:[],listener:null,storeRemovals:[]}
globalThis.authLoadingTest=harness
globalThis.sessionStorage={removeItem:(key)=>harness.storeRemovals.push(key)}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
harness.session=deferred()
harness.client={
  auth:{
    getSession:()=>harness.session.promise,
    onAuthStateChange:(fn)=>{harness.listener=fn;return {data:{subscription:{unsubscribe(){}}}}},
  },
  from(table){
    const request={table,...deferred()};harness.pending.push(request)
    const q={select(){return q},eq(column,value){request.uid=value;return q},abortSignal(){return q},single(){return request.promise},maybeSingle(){return request.promise}}
    return q
  },
}
fs.mkdirSync('.bkit',{recursive:true})
const output=path.resolve('.bkit/auth-loading-test.mjs')
await build({entryPoints:['src/shared/auth.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{
  name:'provider-adapters',setup(b){
    b.onResolve({filter:/^\.\/errors$/},()=>({path:'errors',namespace:'error-adapter'}))
    b.onLoad({filter:/.*/,namespace:'error-adapter'},()=>({contents:'export const LoadError=()=>null; export const reportClientError=(...args)=>globalThis.authLoadingTest.reports.push(args);'}))
    b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'hooks'}))
    b.onLoad({filter:/.*/,namespace:'hooks'},()=>({contents:`
      const h=globalThis.authLoadingTest;
      export const createContext=()=>({Provider:()=>null}); export const useContext=()=>null;
      export const useCallback=f=>f; export const useRef=v=>({current:v});
      export const useEffect=f=>h.effects.push(f);
      export function useState(v){const i=h.states.length;h.states.push(v);return [v,x=>{h.states[i]=typeof x==='function'?x(h.states[i]):x}];}
    `}))
    b.onResolve({filter:/\/lib\/supabase$/},()=>({path:'supabase',namespace:'adapter'}))
    b.onLoad({filter:/.*/,namespace:'adapter'},()=>({contents:'export const supabase=globalThis.authLoadingTest.client;'}))
  },
}]})
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const realSetTimeout=globalThis.setTimeout
globalThis.setTimeout=(fn,delay)=>{harness.timers.push({fn,delay});return harness.timers.length}
try {
  const {AuthProvider}=await import(pathToFileURL(output))
  AuthProvider({children:null})
  const cleanup=harness.effects[0]()
  const session={user:{id:'student-a'}}
  harness.session.resolve({data:{session}})
  await flush()
  harness.listener('SIGNED_IN',session)
  assert.equal(harness.pending.length,2,'session restoration and sign-in share one in-flight profile load')
  harness.pending[0].resolve({data:null,error:{status:503}})
  await flush()
  assert.equal(harness.states[1],null,'profile must not publish before its membership is ready')
  harness.pending[1].resolve({data:{cohorts:{id:'cohort-a'}}})
  await flush()
  assert.equal(harness.states[3],false,'a transient failure must not display the error screen')
  assert.deepEqual(harness.reports,[],'a transient failure must not be recorded as a user-visible error')
  const firstRetry=harness.timers.shift()
  assert.equal(firstRetry.delay,400)
  firstRetry.fn()
  await flush()
  assert.equal(harness.pending.length,4)
  harness.pending[2].resolve({data:{id:'student-a',role:'student'}})
  harness.pending[3].resolve({data:{cohorts:{id:'cohort-a'}}})
  await flush()
  assert.equal(harness.states[1].id,'student-a')
  assert.equal(harness.states[2].id,'cohort-a')
  assert.deepEqual(harness.reports,[])
  harness.listener('SIGNED_IN',{user:{id:'student-b'}})
  await flush()
  assert.equal(harness.states[1],null,'changing accounts clears the previous profile immediately')
  harness.listener('SIGNED_OUT',null)
  harness.pending[4].resolve({data:{id:'student-b',role:'student'}})
  harness.pending[5].resolve({data:{cohorts:{id:'cohort-b'}}})
  await flush()
  assert.equal(harness.states[1],null,'a stale response cannot restore a signed-out profile')
  assert.equal(harness.states[2],null)

  harness.listener('SIGNED_IN',{user:{id:'student-c'}})
  await flush()
  for(let attempt=0;attempt<3;attempt++){
    const index=6+attempt*2
    harness.pending[index].resolve({data:null,error:{status:503}})
    harness.pending[index+1].resolve({data:{cohorts:{id:'cohort-c'}}})
    await flush()
    if(attempt<2){
      assert.equal(harness.states[3],false)
      const timer=harness.timers.shift()
      assert.equal(timer.delay,[400,1200][attempt])
      timer.fn()
      await flush()
    }
  }
  assert.equal(harness.states[3],true,'the error screen appears after all attempts fail')
  assert.deepEqual(harness.reports,[['load','PROFILE_LOAD_FAILED']],'only the final failure is reported')
  harness.listener('USER_UPDATED',{user:{id:'student-c'}})
  await flush()
  harness.pending[12].resolve({data:{id:'student-c',role:'student'}})
  harness.pending[13].resolve({data:{cohorts:{id:'cohort-c'}}})
  await flush()
  assert.equal(harness.states[3],false,'a new load clears the error screen')
  assert.equal(harness.states[1].id,'student-c')

  harness.listener('SIGNED_IN',{user:{id:'student-d'}})
  await flush()
  harness.pending[14].resolve({data:null,error:{status:503}})
  harness.pending[15].resolve({data:{cohorts:{id:'cohort-d'}}})
  await flush()
  harness.listener('SIGNED_OUT',null)
  harness.timers.shift().fn()
  await flush()
  assert.equal(harness.pending.length,16,'sign-out cancels scheduled retries')
  assert.equal(harness.states[3],false)

  harness.listener('SIGNED_IN',{user:{id:'student-e'}})
  await flush()
  harness.pending[16].resolve({data:null,error:{status:403}})
  harness.pending[17].resolve({data:{cohorts:{id:'cohort-e'}}})
  await flush()
  assert.equal(harness.states[3],true,'a permanent permission failure displays the error immediately')
  assert.equal(harness.timers.length,0,'a permanent failure is not retried')
  assert.equal(harness.pending.length,18)
  assert.deepEqual(harness.reports,[['load','PROFILE_LOAD_FAILED'],['load','PROFILE_LOAD_FAILED']])
  cleanup()
  console.log('PASS: auth loading retries transient failures, stops on permanent failures and ignores signed-out responses')
} finally {
  globalThis.setTimeout=realSetTimeout
  delete globalThis.authLoadingTest
  delete globalThis.sessionStorage
  fs.unlinkSync(output)
}
