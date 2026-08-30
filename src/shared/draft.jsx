import { useEffect, useRef, useState } from 'react'
import { IconDeviceFloppy } from '@tabler/icons-react'

/* 자동 임시저장 — 작성 중 폼 상태를 브라우저 localStorage에 디바운스 저장하고,
   재진입 시 복원한다. 서버 저장 후에는 clear()로 지운다. */
const PREFIX = 'ax-draft:'

function readDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null
    return parsed
  } catch { return null }
}

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * @param key      임시저장 키 (사용자·대상별로 고유하게)
 * @param data     저장할 직렬화 가능한 상태 객체
 * @param restore  (data) => void — 마운트 시 저장분이 있으면 호출
 * @param isEmpty  (data) => boolean — 비어 있으면 저장하지 않음(기존 저장분은 지움)
 */
export function useDraft(key, data, restore, isEmpty) {
  const [savedAt, setSavedAt] = useState(null)
  const [restored, setRestored] = useState(false)
  const ready = useRef(false)
  const dataKey = JSON.stringify(data)
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  // 마운트: 저장분 복원
  useEffect(() => {
    if (!key) return
    const d = readDraft(key)
    if (d) {
      restoreRef.current?.(d.data)
      setSavedAt(d.savedAt)
      setRestored(true)
    }
    // 복원 직후 렌더에서 곧바로 덮어쓰지 않도록 다음 틱부터 저장 활성화
    const t = setTimeout(() => { ready.current = true }, 50)
    return () => { clearTimeout(t); ready.current = false }
  }, [key])

  // 변경: 800ms 디바운스 저장
  useEffect(() => {
    if (!key || !ready.current) return
    const empty = isEmpty ? isEmpty(data) : false
    const t = setTimeout(() => {
      try {
        if (empty) { localStorage.removeItem(PREFIX + key); setSavedAt(null); return }
        const now = Date.now()
        localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, data }))
        setSavedAt(now)
      } catch { /* quota 등 — 임시저장은 비필수 */ }
    }, 800)
    return () => clearTimeout(t)
  }, [key, dataKey])

  // 작성 중 이탈 경고 (새로고침·탭 닫기)
  useEffect(() => {
    if (!key) return
    const dirty = !(isEmpty ? isEmpty(data) : false)
    if (!dirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '작성 중인 내용이 있습니다. 이동하시겠습니까?' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [key, dataKey])

  function clear() {
    try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
    setSavedAt(null)
  }

  return { savedAt, restored, clear }
}

/** "임시저장됨 · 18:37" 표시 */
export function DraftBadge({ savedAt, restored }) {
  if (!savedAt) return null
  return (
    <span className="draft-badge" title={restored ? '이전에 작성 중이던 내용을 복원했습니다' : '브라우저에 자동 임시저장되었습니다'}>
      <IconDeviceFloppy size={13} stroke={1.75} />
      {restored ? '임시저장 복원됨' : '임시저장됨'} · {fmtTime(savedAt)}
    </span>
  )
}
