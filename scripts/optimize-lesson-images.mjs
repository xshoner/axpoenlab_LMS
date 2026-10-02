import { createClient } from '@supabase/supabase-js'
import { checksum } from './backup-crypto.mjs'
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const check = result => { if (result.error) throw new Error('Image migration failed: ' + result.error.code); return result.data }
const backup = check(await db.from('backup_runs').select('created_at').order('created_at', { ascending: false }).limit(1))
if (!backup.length || Date.now() - Date.parse(backup[0].created_at) > 3600000) throw new Error('A verified backup from the last hour is required')
const rows = check(await db.rpc('lesson_inline_images'))
const uploaded = new Map(), stats = { lessons: 0, files: 0, before: 0, after: 0, concurrentEditsSkipped: 0 }
for (const row of rows) {
  if (!row.owner) throw new Error('Missing lesson owner')
  const { body } = check(await db.from(row.table_name).select('body').eq('id', row.id).single())
  const images = [...body.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/(png|jpeg|jpg|gif|webp|avif);base64,([a-zA-Z0-9+/=\r\n]+))\1/gi)]
  let updated = body
  for (const [, , source, extension, base64] of images) {
    const bytes = Buffer.from(base64, 'base64'), hash = checksum(bytes)
    const name = `${row.owner}/optimized/${hash}.${extension.toLowerCase() === 'jpeg' ? 'jpg' : extension.toLowerCase()}`
    if (!uploaded.has(name)) {
      const result = await db.storage.from('course-images').upload(name, bytes, { contentType: 'image/' + extension.toLowerCase().replace('jpg', 'jpeg'), cacheControl: '31536000', upsert: false })
      if (result.error && String(result.error.statusCode) !== '409') throw new Error('Image upload failed')
      const downloaded = check(await db.storage.from('course-images').download(name))
      if (checksum(Buffer.from(await downloaded.arrayBuffer())) !== hash) throw new Error('Image content verification failed')
      uploaded.set(name, db.storage.from('course-images').getPublicUrl(name).data.publicUrl)
    }
    updated = updated.replaceAll(source, uploaded.get(name))
  }
  if (updated === body) continue
  const applied = check(await db.rpc('replace_lesson_images', { p_table: row.table_name, p_id: row.id, p_hash: row.hash, p_body: updated }))
  if (!applied) { stats.concurrentEditsSkipped++; continue }
  stats.lessons++; stats.before += Buffer.byteLength(body); stats.after += Buffer.byteLength(updated)
}
stats.files = uploaded.size
console.log(JSON.stringify({ verifiedOriginalImageBytes: true, ...stats }))
