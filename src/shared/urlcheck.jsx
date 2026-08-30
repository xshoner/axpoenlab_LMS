import { useEffect, useState } from 'react'

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
