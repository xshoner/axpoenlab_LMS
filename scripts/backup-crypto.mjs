import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {gzipSync,gunzipSync,createGzip,createGunzip} from 'node:zlib'
import {createReadStream,createWriteStream} from 'node:fs'
import fs from 'node:fs/promises'
import {Readable,Transform,Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
const magic=Buffer.from('AXLMSB1')
export const checksum=data=>createHash('sha256').update(data).digest('hex')
function key(value){if(!/^[a-f0-9]{64}$/i.test(value||''))throw new Error('LMS_BACKUP_KEY must be a 32-byte hexadecimal key');return Buffer.from(value,'hex')}
export function encryptBackup(snapshot,secret){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(magic);const data=Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))),cipher.final()]);return Buffer.concat([magic,iv,cipher.getAuthTag(),data])}
export function decryptBackup(buffer,secret){if(!buffer.subarray(0,7).equals(magic))throw new Error('Invalid backup format');const decipher=createDecipheriv('aes-256-gcm',key(secret),buffer.subarray(7,19));decipher.setAAD(magic);decipher.setAuthTag(buffer.subarray(19,35));const snapshot=JSON.parse(gunzipSync(Buffer.concat([decipher.update(buffer.subarray(35)),decipher.final()])).toString());if(snapshot.version!==1||!snapshot.tables||!Array.isArray(snapshot.files))throw new Error('Invalid snapshot');for(const file of snapshot.files)if(checksum(Buffer.from(file.data,'base64'))!==file.checksum)throw new Error('File checksum mismatch');return snapshot}

export async function verifyBackupFile(filename,secret) {
  const handle=await fs.open(filename,'r'),header=Buffer.alloc(35)
  try { if((await handle.read(header,0,35,0)).bytesRead!==35||!header.subarray(0,7).equals(magic))throw new Error('Invalid backup format') }
  finally { await handle.close() }
  const decipher=createDecipheriv('aes-256-gcm',key(secret),header.subarray(7,19))
  decipher.setAAD(magic);decipher.setAuthTag(header.subarray(19,35))
  const encryptedHash=createHash('sha256').update(header),plainHash=createHash('sha256')
  let plainBytes=0
  await pipeline(createReadStream(filename,{start:35}),
    new Transform({transform(chunk,encoding,done){encryptedHash.update(chunk);done(null,chunk)}}),decipher,createGunzip(),
    new Writable({write(chunk,encoding,done){plainHash.update(chunk);plainBytes+=chunk.length;done()}}))
  return {checksum:encryptedHash.digest('hex'),plainChecksum:plainHash.digest('hex'),plainBytes}
}

export async function writeBackupFile(filename,chunks,secret) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv),plainHash=createHash('sha256')
  cipher.setAAD(magic)
  // Same AXLMSB1 envelope and JSON payload: existing restore tools remain compatible.
  await fs.writeFile(filename,Buffer.concat([magic,iv,Buffer.alloc(16)]),{flag:'wx',mode:0o600})
  try {
    async function* counted(){for await(const chunk of chunks){const bytes=Buffer.from(chunk);plainHash.update(bytes);yield bytes}}
    await pipeline(Readable.from(counted()),createGzip(),cipher,createWriteStream(filename,{flags:'a'}))
    const handle=await fs.open(filename,'r+')
    try { await handle.write(cipher.getAuthTag(),0,16,19) } finally { await handle.close() }
    const verified=await verifyBackupFile(filename,secret)
    if(verified.plainChecksum!==plainHash.digest('hex'))throw new Error('Backup plaintext checksum mismatch')
    return {checksum:verified.checksum,bytes:(await fs.stat(filename)).size}
  } catch(error) { await fs.unlink(filename).catch(()=>{});throw error }
}
