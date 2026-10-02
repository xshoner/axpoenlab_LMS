import fs from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@supabase/supabase-js'
import {encryptBackup,decryptBackup,checksum} from './backup-crypto.mjs'
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
console.log('Staging a consistent database snapshot...')
const {data:staged,error}=await db.rpc('lms_backup_stage').abortSignal(AbortSignal.timeout(130000))
if(error)throw new Error('Database snapshot failed: '+error.code)
const snapshot={version:1,created_at:staged.created_at,source_url:process.env.SUPABASE_URL,tables:{}}
try {
for(const [table,count] of Object.entries(staged.tables)){
  const rows=[],size=['public.master_courses','public.cohort_courses'].includes(table)?1:200
  for(let offset=0;offset<count;offset+=size){
    const {data,error}=await db.rpc('lms_backup_chunk',{p_snapshot:staged.id,p_table:table,p_offset:offset,p_size:size}).abortSignal(AbortSignal.timeout(30000))
    if(error)throw new Error('Snapshot chunk failed: '+error.code)
    rows.push(...data)
  }
  if(rows.length!==count)throw new Error('Snapshot row count mismatch')
  snapshot.tables[table]=rows
}
}finally{
  const cleanup=await db.from('backup_snapshots').delete().eq('id',staged.id)
  if(cleanup.error)throw new Error('Snapshot cleanup failed')
}
snapshot.files=[]
console.log('Database snapshot received; verifying stored files...')
for(const object of snapshot.tables['storage.objects']||[]){
  const {data,error}=await db.storage.from(object.bucket_id).download(object.name)
  if(error)throw new Error('Backup file download failed')
  const buffer=Buffer.from(await data.arrayBuffer())
  snapshot.files.push({bucket:object.bucket_id,name:object.name,type:data.type,checksum:checksum(buffer),data:buffer.toString('base64')})
}
const encrypted=encryptBackup(snapshot,process.env.LMS_BACKUP_KEY)
const verified=decryptBackup(encrypted,process.env.LMS_BACKUP_KEY)
const directory=process.env.LMS_BACKUP_DIR||'.bkit/backups';await fs.mkdir(directory,{recursive:true})
const filename=path.join(directory,'lms-'+new Date().toISOString().replace(/[:.]/g,'-')+'.lms-backup')
await fs.writeFile(filename,encrypted,{mode:0o600})
const stats={checksum:checksum(encrypted),bytes:encrypted.length,tables:Object.keys(verified.tables).length,files:verified.files.length,rows:Object.values(verified.tables).reduce((n,rows)=>n+rows.length,0)}
await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify(stats),{mode:0o600})
if(process.env.LMS_BACKUP_DEFER_RECORD!=='1'){
  const recorded=await db.rpc('record_backup',{p_checksum:stats.checksum,p_bytes:stats.bytes,p_tables:stats.tables,p_files:stats.files})
  if(recorded.error)throw new Error('Backup verification passed but status recording failed')
}
console.log(JSON.stringify({file:filename,verified:true,...stats}))
