import DOMPurify from 'dompurify'
import { supabase } from './supabase'

// 본문(rich body) 안의 모든 링크는 새 창으로 열리게 강제한다 (학습 화면 이탈 방지)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// iframe은 유튜브 임베드 도메인만 허용 — 그 외 출처의 iframe은 통째로 제거한다
const YT_EMBED_RE = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[A-Za-z0-9_-]{11}([/?#].*)?$/
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute?.('src') || ''
    if (!YT_EMBED_RE.test(src)) node.remove()
  }
})

export function sanitizeRichBody(html) {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'],
  })
}

export function fmtBytes(n) {
  if (n == null) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function fmtDate(d, withTime = false) {
  if (!d) return '-'
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  if (!withTime) return `${y}-${m}-${day}`
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

export function isNew(d, days = 3) {
  return Date.now() - new Date(d).getTime() < days * 86400_000
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

// Supabase Storage 객체 키는 한글 등 비ASCII 문자를 허용하지 않는다 —
// 경로는 안전한 임의 이름으로 만들고 원본 파일명은 DB 컬럼에 보관한다.
export function storageSafeName(filename) {
  const ext = extOf(filename).replace(/[^a-z0-9]/g, '')
  const rand = Math.random().toString(36).slice(2, 10)
  return `${Date.now()}_${rand}${ext ? '.' + ext : ''}`
}

// cohort_members.user_id가 UNIQUE라 PostgREST가 단건 객체로 반환할 수 있다 —
// 배열/객체 어느 쪽이든 첫 멤버십 하나로 정규화한다.
export function asOne(rel) {
  return Array.isArray(rel) ? rel[0] : rel || null
}

export async function getSettings() {
  const { data } = await supabase.from('system_settings').select('*')
  const map = {}
  for (const row of data || []) map[row.key] = row.value
  return {
    allowedExtensions: map.allowed_extensions || ['pdf', 'docx', 'pptx', 'xlsx', 'hwp', 'hwpx', 'zip', 'ipynb', 'py', 'txt', 'png', 'jpg'],
    maxFileSizeMb: Number(map.max_file_size_mb || 5),
    showVisitorCounter: map.show_visitor_counter !== false,
  }
}

export async function downloadFile(bucket, path, filename) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, {
    download: filename || true,
  })
  if (error) throw error
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = filename || ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  return path
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const ROLE_LABEL = { student: '학습자', admin: '관리자', super_admin: '슈퍼관리자' }
export const COHORT_STATUS = { preparing: '준비중', active: '진행중', closed: '종료' }
export const CONTENT_STATUS = { draft: '초안', open: '공개', closed: '마감' }
