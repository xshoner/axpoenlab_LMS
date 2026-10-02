import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
const magic=Buffer.from('AXLMSB1')
export const checksum=data=>createHash('sha256').update(data).digest('hex')
function key(value){if(!/^[a-f0-9]{64}$/i.test(value||''))throw new Error('LMS_BACKUP_KEY must be a 32-byte hexadecimal key');return Buffer.from(value,'hex')}
export function encryptBackup(snapshot,secret){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(magic);const data=Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))),cipher.final()]);return Buffer.concat([magic,iv,cipher.getAuthTag(),data])}
export function decryptBackup(buffer,secret){if(!buffer.subarray(0,7).equals(magic))throw new Error('Invalid backup format');const decipher=createDecipheriv('aes-256-gcm',key(secret),buffer.subarray(7,19));decipher.setAAD(magic);decipher.setAuthTag(buffer.subarray(19,35));const snapshot=JSON.parse(gunzipSync(Buffer.concat([decipher.update(buffer.subarray(35)),decipher.final()])).toString());if(snapshot.version!==1||!snapshot.tables||!Array.isArray(snapshot.files))throw new Error('Invalid snapshot');for(const file of snapshot.files)if(checksum(Buffer.from(file.data,'base64'))!==file.checksum)throw new Error('File checksum mismatch');return snapshot}
