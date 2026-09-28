import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// Execute the actual provider with controlled asynchronous auth/DB responses.
const harness={states:[],effects:[],pending:[],listener:null,storeRemovals:[]}
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
    const q={select(){return q},eq(column,value){request.uid=value;return q},single(){return request.promise},maybeSingle(){return request.promise}}
    return q
  },
}
fs.mkdirSync('.bkit',{recursive:true})
const output=path.resolve('.bkit/auth-loading-test.mjs')
await build({entryPoints:['src/shared/auth.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{
  name:'provider-adapters',setup(b){
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
try {
  const {AuthProvider}=await import(pathToFileURL(output))
  AuthProvider({children:null})
  const cleanup=harness.effects[0]()
  const session={user:{id:'student-a'}}
  harness.session.resolve({data:{session}})
  await flush()
  harness.listener('SIGNED_IN',session)
  assert.equal(harness.pending.length,2,'session restoration and sign-in share one in-flight profile load')
  harness.pending[0].resolve({data:{id:'student-a',role:'student'}})
  await flush()
  assert.equal(harness.states[1],null,'profile must not publish before its membership is ready')
  harness.pending[1].resolve({data:{cohorts:{id:'cohort-a'}}})
  await flush()
  assert.equal(harness.states[1].id,'student-a')
  assert.equal(harness.states[2].id,'cohort-a')
  harness.listener('SIGNED_IN',{user:{id:'student-b'}})
  harness.listener('SIGNED_OUT',null)
  harness.pending[2].resolve({data:{id:'student-b',role:'student'}})
  harness.pending[3].resolve({data:{cohorts:{id:'cohort-b'}}})
  await flush()
  assert.equal(harness.states[1],null,'a stale response cannot restore a signed-out profile')
  assert.equal(harness.states[2],null)
  cleanup()
  console.log('PASS: auth loading deduplicates requests, publishes membership atomically and ignores signed-out responses')
} finally {
  delete globalThis.authLoadingTest
  delete globalThis.sessionStorage
  fs.unlinkSync(output)
}
