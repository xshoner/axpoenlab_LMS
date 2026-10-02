import fs from 'node:fs/promises'
import {decryptBackup,checksum} from './backup-crypto.mjs'
export function restoreSql(snapshot){
  const names=Object.keys(snapshot.tables).filter(name=>/^(public|auth|storage)\.[a-z_]+$/.test(name))
  if(names.length!==Object.keys(snapshot.tables).length)throw new Error('Invalid table names')
  const q=name=>name.split('.').map(s=>'"'+s+'"').join('.')
  // Destructive restore is an explicitly generated SQL artifact for an isolated target.
  const statements=['begin;',"set local session_replication_role='replica';",'truncate '+names.map(q).join(',')+' restart identity cascade;']
  for(const name of names){
    const tag='$backup_'+crypto.randomUUID().replaceAll('-','')+'$'
    const block='$restore_'+crypto.randomUUID().replaceAll('-','')+'$'
    statements.push(`do ${block} declare columns text; begin select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid='${name}'::regclass and attnum>0 and not attisdropped and attgenerated=''; execute 'insert into ${q(name)} ('||columns||') overriding system value select '||columns||' from jsonb_populate_recordset(null::${q(name)},$1)' using ${tag}${JSON.stringify(snapshot.tables[name])}${tag}::jsonb; end ${block};`)
  }
  statements.push("set local session_replication_role='origin';",`do $$ declare c record; begin for c in select conrelid::regclass as tab,conname,pg_get_constraintdef(oid) as def from pg_constraint where contype='f' and connamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace) loop execute format('alter table %s drop constraint %I',c.tab,c.conname); execute format('alter table %s add constraint %I %s',c.tab,c.conname,c.def); end loop; end $$;`, `do $$ declare s record; maximum bigint; begin for s in select table_schema,table_name,column_name,pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) as seq from information_schema.columns where table_schema='public' loop if s.seq is not null then execute format('select max(%I) from %I.%I',s.column_name,s.table_schema,s.table_name) into maximum; perform setval(s.seq::regclass,coalesce(maximum,1),maximum is not null); end if; end loop; end $$;`,'commit;')
  return statements.join('\n')
}
if(process.argv[1]?.endsWith('restore-backup.mjs')){
  const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/restore-backup.mjs FILE [--sql OUTPUT_FOR_EMPTY_STAGING_TARGET]')
  const snapshot=decryptBackup(await fs.readFile(file),process.env.LMS_BACKUP_KEY)
  if(process.argv[3]==='--sql'){if(!process.argv[4])throw new Error('Output file required');await fs.writeFile(process.argv[4],restoreSql(snapshot),{mode:0o600})}
  if(process.argv[3]==='--files'){
    const target=process.env.LMS_RESTORE_URL
    if(!target||!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(target)||target.replace(/\/$/,'')===(snapshot.source_url||'https://ugelgndotyppgksbubot.supabase.co').replace(/\/$/,''))throw new Error('A different isolated Supabase restore target is required')
    const {createClient}=await import('@supabase/supabase-js')
    const db=createClient(target,process.env.LMS_RESTORE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    for(const bucket of snapshot.tables['storage.buckets']||[]){
      const exists=await db.storage.getBucket(bucket.id)
      if(exists.error){const result=await db.storage.createBucket(bucket.id,{public:bucket.public,fileSizeLimit:bucket.file_size_limit,allowedMimeTypes:bucket.allowed_mime_types});if(result.error)throw new Error('Restore bucket creation failed')}
    }
    for(const file of snapshot.files){
      const result=await db.storage.from(file.bucket).upload(file.name,Buffer.from(file.data,'base64'),{contentType:file.type,upsert:true})
      if(result.error)throw new Error('Restore file upload failed')
      const downloaded=await db.storage.from(file.bucket).download(file.name)
      if(downloaded.error||checksum(Buffer.from(await downloaded.data.arrayBuffer()))!==file.checksum)throw new Error('Restored file verification failed')
    }
    console.log('Files restored and verified in the isolated target.')
  }
  console.log(JSON.stringify({verified:true,created_at:snapshot.created_at,tables:Object.keys(snapshot.tables).length,files:snapshot.files.length,rows:Object.values(snapshot.tables).reduce((n,rows)=>n+rows.length,0)}))
}
