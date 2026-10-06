import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { encryptBackup, decryptBackup, checksum, writeBackupFile, verifyBackupFile } from './backup-crypto.mjs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import { csvCell } from '../src/lib/csv.js'
import { readAll } from '../src/lib/queries.js'
import { retryDeliveryRequest } from '../src/lib/deliveryRequests.js'
test('delivery retries are bounded and only retry transport or gateway failures', async () => {
  let attempts = 0
  const waits = []
  const wait = async ms => { waits.push(ms) }
  assert.deepEqual(await retryDeliveryRequest(async () => ++attempts < 3 ? { error: { statusCode: '504', message: 'HTTP 504 error' } } : { data: 'same draft' }, wait), { data: 'same draft' })
  assert.equal(attempts, 3); assert.deepEqual(waits, [1000, 2000])
  attempts = 0
  await assert.rejects(retryDeliveryRequest(async () => { attempts++; throw new Error('Failed to fetch') }, wait), /fetch/)
  assert.equal(attempts, 3)
  attempts = 0
  await assert.rejects(retryDeliveryRequest(async () => { attempts++; return { error: new Error('forbidden') } }, wait), /forbidden/)
  assert.equal(attempts, 1)
})
test('CSV rejects formulas through whitespace and control characters', () => {
  for (const value of ['=1+1', '+cmd', '-1', '@SUM(A1)', '  =cmd', '\t=cmd', '\r=cmd', '\n=cmd', '\ufeff=cmd']) assert.ok(csvCell(value).includes("'"))
  assert.equal(csvCell('학생'), '학생'); assert.equal(csvCell('a,"b"'), '"a,""b"""')
})
test('all-row readers retrieve beyond the API 1000-row limit and reject partial errors', async () => {
  const rows = Array.from({ length: 1218 }, (_, id) => ({ id }))
  const query = () => ({ range: (start, end) => Promise.resolve({ data: rows.slice(start, end + 1) }) })
  assert.deepEqual(await readAll(query), rows)
  await assert.rejects(readAll(() => ({ range: start => Promise.resolve(start ? { error: new Error('offline') } : { data: rows.slice(0, 200) }) })), /offline/)
})
test('encrypted backups round-trip database and files and reject tampering and wrong keys', () => {
  const secret = randomBytes(32).toString('hex'), bytes = Buffer.from('original file bytes')
  const snapshot = { version: 1, tables: { 'public.profiles': [{ name: '학생' }] }, files: [{ checksum: checksum(bytes), data: bytes.toString('base64') }] }
  const encrypted = encryptBackup(snapshot, secret)
  assert.deepEqual(decryptBackup(encrypted, secret), snapshot)
  assert.equal(encrypted.includes(Buffer.from('학생')), false)
  const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1
  assert.throws(() => decryptBackup(tampered, secret)); assert.throws(() => decryptBackup(encrypted, randomBytes(32).toString('hex')))
})
test('streamed backups preserve the existing restore format and reject truncated, tampered and wrong-key files', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ax-lms-backup-test-')),filename=path.join(directory,'snapshot.lms-backup')
  const secret=randomBytes(32).toString('hex'),bytes=randomBytes(2*1048576)
  const snapshot={version:1,tables:{'public.profiles':[{name:'학생'}]},files:[{checksum:checksum(bytes),data:bytes.toString('base64')}]}
  const json=JSON.stringify(snapshot)
  async function* chunks(){for(let offset=0;offset<json.length;offset+=65535)yield json.slice(offset,offset+65535)}
  try {
    const stats=await writeBackupFile(filename,chunks(),secret),encrypted=await fs.readFile(filename)
    assert.equal(stats.checksum,checksum(encrypted));assert.equal(stats.bytes,encrypted.length)
    assert.deepEqual(decryptBackup(encrypted,secret),snapshot,'legacy restore can decode the streamed artifact')
    await assert.rejects(verifyBackupFile(filename,randomBytes(32).toString('hex')))
    encrypted[encrypted.length-1]^=1;await fs.writeFile(filename,encrypted)
    await assert.rejects(verifyBackupFile(filename,secret))
    await fs.writeFile(filename,encrypted.subarray(0,20))
    await assert.rejects(verifyBackupFile(filename,secret),/Invalid backup format/)
  }finally{await fs.unlink(filename).catch(()=>{});await fs.rmdir(directory)}
})
test('actual backup job streams paged rows and exact file bytes, cleans its stage and records verified counts', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ax-lms-backup-job-'))
  const secret=randomBytes(32).toString('hex'),bytes=randomBytes(65536),empty=Buffer.alloc(0)
  const tables={'public.profiles':Array.from({length:201},(_,id)=>({id,name:`학생 ${id}`})),
    'storage.objects':[{bucket_id:'test',name:'한글"파일.bin'},{bucket_id:'test',name:'empty.txt'}],'public.empty':[]}
  let cleaned=false,recorded,transientFailures=1
  const db={rpc(name,p){return {abortSignal:async()=>{
    if(name==='lms_backup_chunk'&&transientFailures-- >0)return {error:{code:'',message:'TimeoutError'},status:0}
    return {data:name==='lms_backup_stage'?{id:'mock',created_at:'2026-10-06',tables:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))}:
    name==='lms_backup_chunk'?tables[p.p_table].slice(p.p_offset,p.p_offset+p.p_size):(recorded=p,null)}
  }}},
    from(){return {delete(){return this},eq(){return this},abortSignal:async()=>{cleaned=true;return {}}}},
    storage:{from(){return {download:async name=>({data:new Blob([name==='empty.txt'?empty:bytes],{type:'application/octet-stream'})})}}}}
  const envKeys=['SUPABASE_URL','LMS_BACKUP_KEY','LMS_BACKUP_DIR','LMS_BACKUP_DEFER_RECORD'],before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]))
  try {
    Object.assign(process.env,{SUPABASE_URL:'https://mock.example.invalid',LMS_BACKUP_KEY:secret,LMS_BACKUP_DIR:directory,LMS_BACKUP_DEFER_RECORD:'0'})
    const source=(await fs.readFile(new URL('./backup.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'')
    const run=new (Object.getPrototypeOf(async function(){}).constructor)('fs','path','delay','createClient','writeBackupFile','checksum','console',source)
    await run(fs,path,delay,()=>db,writeBackupFile,checksum,{log(){}})
    const files=await fs.readdir(directory),backup=files.find(n=>n.endsWith('.lms-backup'))
    const restored=decryptBackup(await fs.readFile(path.join(directory,backup)),secret)
    assert.deepEqual(restored.tables,tables)
    assert.deepEqual(Buffer.from(restored.files[0].data,'base64'),bytes)
    assert.deepEqual(Buffer.from(restored.files[1].data,'base64'),empty)
    const stats=JSON.parse(await fs.readFile(path.join(directory,'metadata.json'),'utf8'))
    assert.equal(stats.rows,203);assert.equal(stats.files,2);assert.equal(stats.tables,3)
    assert.equal(recorded.p_checksum,stats.checksum);assert.equal(cleaned,true)
  }finally{
    for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}
    for(const name of await fs.readdir(directory))await fs.unlink(path.join(directory,name))
    await fs.rmdir(directory)
  }
})
