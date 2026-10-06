import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transform } from 'esbuild'
const source = fs.readFileSync('supabase/functions/distribution-files/index.ts','utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace(/^Deno\.serve[\s\S]*$/m,'')
const { code } = await transform(source,{loader:'ts',target:'es2022'})
const create = new Function(`${code};return createDistributionFilesHandler;`)()
const fileId=crypto.randomUUID(), batchId=crypto.randomUUID(), senderId=crypto.randomUUID()
const file={id:fileId,batch_id:batchId,file_path:`${senderId}/${batchId}/lesson.pdf`,deleted_at:null}
const profiles={super:{role:'super_admin',status:'active'},admin:{role:'admin',status:'active'},student:{role:'student',status:'active'},inactive:{role:'super_admin',status:'inactive'}}
let failStorage=false, failFinish=false, removeCalls=0, finishCalls=0, physicallyExists=true
const db={
  auth:{getUser:async id=>({data:{user:profiles[id]?{id}:null}})},
  from(table){const filters={},q={select(){return q},eq(k,v){filters[k]=v;return q},single(){return q},maybeSingle(){return q},then(resolve,reject){const data=table==='profiles'?profiles[filters.id]:table==='file_batches'?{sender_id:senderId,status:'sent'}:filters.id===fileId?file:null;return Promise.resolve({data}).then(resolve,reject)}};return q},
  storage:{from(bucket){assert.equal(bucket,'student-deliveries');return {remove:async paths=>{assert.deepEqual(paths,[file.file_path]);removeCalls++;if(failStorage)return {error:{message:'504'}};physicallyExists=false;return {data:[]}}}}},
  async rpc(name,args){assert.equal(name,'complete_distribution_file_delete');assert.deepEqual(args,{p_file:fileId,p_actor:'super'});finishCalls++;if(failFinish)return {error:{message:'503'}};assert.equal(physicallyExists,false);file.deleted_at=new Date().toISOString();return {data:null}},
}
const handler=create(db)
async function invoke(who,body={file_id:fileId},view=false){const r=await handler(new Request('https://test.local',{method:'POST',headers:{Authorization:`Bearer ${who}`,'Content-Type':'application/json',...(view?{'x-admin-view':senderId}:{})},body:JSON.stringify(body)}));return {status:r.status,...await r.json()}}
for(const who of ['missing','admin','student','inactive'])assert.ok([401,403].includes((await invoke(who)).status))
assert.equal((await invoke('super',undefined,true)).status,403)
assert.equal(removeCalls,0)
assert.equal((await invoke('super',{file_id:'../other-file'})).status,400)
assert.equal((await invoke('super',{file_id:crypto.randomUUID()})).status,404)
const safePath=file.file_path;file.file_path='another-bucket/lesson.pdf'
assert.equal((await invoke('super')).status,409);assert.equal(removeCalls,0);file.file_path=safePath
failStorage=true
assert.equal((await invoke('super')).status,503);assert.equal(finishCalls,0);assert.equal(file.deleted_at,null)
failStorage=false;failFinish=true
assert.equal((await invoke('super')).status,503);assert.equal(file.deleted_at,null);assert.equal(physicallyExists,false)
failFinish=false
assert.equal((await invoke('super')).ok,true);assert.ok(file.deleted_at)
const calls=removeCalls
assert.equal((await invoke('super')).ok,true);assert.equal(removeCalls,calls)
console.log('PASS: actual attachment deletion handler rejects non-super, inactive and preview users; scopes the bucket/path; retries partial deletion without false success')
