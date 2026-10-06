import fs from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@supabase/supabase-js'
import {writeBackupFile,checksum} from './backup-crypto.mjs'
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(url,options)=>fetch(url,{...options,signal:options?.signal||AbortSignal.timeout(60000)})},
})
console.log('Staging a consistent database snapshot...')
const {data:staged,error}=await db.rpc('lms_backup_stage').abortSignal(AbortSignal.timeout(130000))
if(error)throw new Error('Database snapshot failed: '+error.code)
let fileCount=0
async function* rows(table){
  const count=staged.tables[table]||0,size=['public.master_courses','public.cohort_courses'].includes(table)?1:200
  let received=0
  for(let offset=0;offset<count;offset+=size){
    const {data,error}=await db.rpc('lms_backup_chunk',{p_snapshot:staged.id,p_table:table,p_offset:offset,p_size:size}).abortSignal(AbortSignal.timeout(30000))
    if(error)throw new Error('Snapshot chunk failed: '+error.code)
    for(const row of data){received++;yield row}
  }
  if(received!==count)throw new Error('Snapshot row count mismatch')
}
async function* snapshot(){
  yield JSON.stringify({version:1,created_at:staged.created_at,source_url:process.env.SUPABASE_URL}).slice(0,-1)+',"tables":{'
  let separator=''
  for(const table of Object.keys(staged.tables)){
    yield separator+JSON.stringify(table)+':[';separator=','
    let rowSeparator=''
    for await(const row of rows(table)){yield rowSeparator+JSON.stringify(row);rowSeparator=','}
    yield ']'
  }
  yield '},"files":['
  separator=''
  for await(const object of rows('storage.objects')){
    const {data,error}=await db.storage.from(object.bucket_id).download(object.name)
    if(error)throw new Error('Backup file download failed')
    // ponytail: one file in memory (50MB upload limit); stream storage bytes if that limit grows.
    const buffer=Buffer.from(await data.arrayBuffer())
    yield separator+JSON.stringify({bucket:object.bucket_id,name:object.name,type:data.type,checksum:checksum(buffer)}).slice(0,-1)+',"data":"'
    // Multiple of three keeps concatenated base64 chunks identical to the original bytes.
    for(let offset=0;offset<buffer.length;offset+=65535)yield buffer.subarray(offset,offset+65535).toString('base64')
    yield '"}';separator=',';fileCount++
  }
  yield ']}'
}
let filename,stats
try {
  const directory=process.env.LMS_BACKUP_DIR||'.bkit/backups';await fs.mkdir(directory,{recursive:true})
  filename=path.join(directory,'lms-'+new Date().toISOString().replace(/[:.]/g,'-')+'.lms-backup')
  console.log('Streaming database and files into an encrypted, verified backup...')
  const encrypted=await writeBackupFile(filename,snapshot(),process.env.LMS_BACKUP_KEY)
  stats={...encrypted,tables:Object.keys(staged.tables).length,files:fileCount,rows:Object.values(staged.tables).reduce((n,count)=>n+count,0)}
  await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify(stats),{mode:0o600})
}finally{
  const cleanup=await db.from('backup_snapshots').delete().eq('id',staged.id).abortSignal(AbortSignal.timeout(30000))
  if(cleanup.error)throw new Error('Snapshot cleanup failed')
}
if(process.env.LMS_BACKUP_DEFER_RECORD!=='1'){
  const recorded=await db.rpc('record_backup',{p_checksum:stats.checksum,p_bytes:stats.bytes,p_tables:stats.tables,p_files:stats.files}).abortSignal(AbortSignal.timeout(30000))
  if(recorded.error)throw new Error('Backup verification passed but status recording failed')
}
console.log(JSON.stringify({file:filename,verified:true,...stats}))
