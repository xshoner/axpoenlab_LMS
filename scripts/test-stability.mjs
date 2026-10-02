import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { encryptBackup, decryptBackup, checksum } from './backup-crypto.mjs'
import { csvCell } from '../src/lib/csv.js'
import { readAll } from '../src/lib/queries.js'
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
