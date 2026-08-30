import { useCallback, useEffect, useMemo, useState } from 'react'

export const AI_OPTIONS = ['GPT', 'Gemini', 'Claude', 'Meta', 'Grok', 'Perplexity', '기타']

/* 브라우저에서 외부 URL의 "연결 가능 여부"만 간단히 확인한다.
   CORS 때문에 응답 본문은 읽을 수 없으므로 no-cors 요청이 네트워크 오류 없이 끝나면 '정상'으로 본다.
   (DNS 실패·연결 거부·타임아웃이면 '이상') */
export async function checkUrlReachable(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** URL 입력값을 감시해 연결 상태 배지를 표시한다 (입력 후 700ms 디바운스). */
export function UrlHealthBadge({ url }) {
  const [state, setState] = useState('idle') // idle | checking | ok | bad
  const trimmed = (url || '').trim()
  const valid = /^https?:\/\/[^\s]+\.[^\s]+/.test(trimmed)

  useEffect(() => {
    if (!valid) { setState('idle'); return }
    let alive = true
    setState('checking')
    const t = setTimeout(async () => {
      const ok = await checkUrlReachable(trimmed)
      if (alive) setState(ok ? 'ok' : 'bad')
    }, 700)
    return () => { alive = false; clearTimeout(t) }
  }, [trimmed, valid])

  if (state === 'idle') return null
  const label = state === 'checking' ? '확인 중' : state === 'ok' ? '정상' : '이상'
  const title = state === 'ok' ? 'URL에 정상적으로 연결됩니다'
    : state === 'bad' ? 'URL에 연결할 수 없습니다. 주소를 다시 확인해 주세요.' : '연결 상태를 확인하고 있습니다'
  return (
    <span className={`url-health ${state}`} title={title} aria-live="polite">
      <span className="dot" />{label}
    </span>
  )
}

/* 웹앱 URL 미리보기 썸네일 — WordPress mshots 공개 스냅샷 서비스.
   연결이 '정상'일 때만 표시하고, 스냅샷 생성 중(로딩 GIF 리다이렉트)에는 준비될 때까지 폴링한다. */
export function UrlThumbnail({ url, width = 640, height = 400 }) {
  const trimmed = (url || '').trim()
  const valid = /^https?:\/\/[^\s]+\.[^\s]+/.test(trimmed)
  const [reachable, setReachable] = useState(null)
  const [tick, setTick] = useState(0)
  const [failed, setFailed] = useState(false)
  const thumb = valid ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(trimmed)}?w=${width}&h=${height}` : ''

  useEffect(() => {
    if (!valid) { setReachable(null); return }
    let alive = true
    setReachable(null); setFailed(false); setTick(0)
    checkUrlReachable(trimmed).then((ok) => { if (alive) setReachable(ok) })
    return () => { alive = false }
  }, [trimmed, valid])

  // 스냅샷 준비 폴링: opaqueredirect(로딩 GIF)면 3초 후 재시도, 최대 20회
  useEffect(() => {
    if (!reachable || !thumb) return
    let alive = true
    let tries = 0
    const poll = async () => {
      tries += 1
      let ready = false
      try {
        const res = await fetch(thumb, { mode: 'no-cors', redirect: 'manual', cache: 'no-store' })
        ready = res.type !== 'opaqueredirect'
      } catch { ready = true }
      if (!alive) return
      if (ready) { setTick(tries); return }
      if (tries < 20) setTimeout(poll, 3000)
    }
    const t = setTimeout(poll, 2500)
    return () => { alive = false; clearTimeout(t) }
  }, [reachable, thumb])

  if (!valid || !reachable || failed) return null
  return (
    <a href={trimmed} target="_blank" rel="noreferrer" className="url-thumb" title="웹앱 미리보기 (클릭하여 열기)">
      <img src={tick ? `${thumb}&r=${tick}` : thumb} alt="웹앱 미리보기" loading="lazy" referrerPolicy="no-referrer"
        onError={() => setFailed(true)} />
      <span className="url-thumb-label">미리보기{tick === 0 ? ' · 스냅샷 생성 중…' : ''}</span>
    </a>
  )
}

/* 여러 URL의 연결 상태를 한 번에 검사한다 (목록용). 재검사는 recheck() 호출. */
export function useUrlStatuses(urls) {
  const urlsKey = JSON.stringify(urls || [])
  const list = useMemo(() => [...new Set((JSON.parse(urlsKey)).filter((u) => u && /^https?:\/\//i.test(u)))], [urlsKey])
  const [map, setMap] = useState({})
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)

  const run = useCallback(async (targets) => {
    if (targets.length === 0) return
    setChecking(true)
    setMap((m) => { const n = { ...m }; for (const u of targets) n[u] = 'checking'; return n })
    // 동시 6개씩 검사
    const queue = [...targets]
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift()
        const ok = await checkUrlReachable(u, 8000)
        setMap((m) => ({ ...m, [u]: ok ? 'ok' : 'bad' }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker))
    setChecking(false)
    setCheckedAt(Date.now())
  }, [])

  // 새로 나타난 URL만 자동 검사
  useEffect(() => {
    const fresh = list.filter((u) => !(u in map))
    if (fresh.length) run(fresh)
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  const recheck = useCallback(() => run(list), [list, run])

  let ok = 0, bad = 0, pending = 0
  for (const u of list) {
    const st = map[u]
    if (st === 'ok') ok += 1
    else if (st === 'bad') bad += 1
    else pending += 1
  }
  return { map, checking, recheck, ok, bad, pending, total: list.length, checkedAt }
}

/** 목록 셀용 상태 표시: 🟢 정상 / 🔴 오류 / 확인 중 / URL 없음 */
export function UrlStatusDot({ url, state, link = false }) {
  if (!url) return <span className="t-caption muted-soft">URL 없음</span>
  const st = state || 'checking'
  const label = st === 'ok' ? '정상' : st === 'bad' ? '오류' : '확인 중'
  const inner = <><span className="dot" />{label}</>
  const cls = `url-status ${st}`
  if (link) {
    return <a href={url} target="_blank" rel="noreferrer" className={cls} title={url}>{inner}</a>
  }
  return <span className={cls} title={url}>{inner}</span>
}
