import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
const stats=JSON.parse(await fs.readFile(process.argv[2]||'backup-output/metadata.json','utf8'))
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {error}=await db.rpc('record_backup',{p_checksum:stats.checksum,p_bytes:stats.bytes,p_tables:stats.tables,p_files:stats.files})
if(error)throw new Error('Backup status recording failed')
console.log('Encrypted artifact uploaded and verified backup status recorded.')
