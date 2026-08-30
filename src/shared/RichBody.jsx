import { useEffect, useRef } from 'react'
import { sanitizeRichBody } from '../lib/helpers'

/* 본문(rich body) 렌더러 — 복사 블록(.copy-block)의 [복사] 버튼을 동작시킨다.
   RichEditor에서 삽입한 명령어/프롬프트 블록은 정적 HTML이므로 여기서 이벤트 위임으로 처리. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch { return false }
  }
}

export default function RichBody({ html, className = '', style }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = async (e) => {
      const btn = e.target.closest?.('.cb-copy')
      if (!btn || !el.contains(btn)) return
      e.preventDefault()
      const block = btn.closest('.copy-block')
      const body = block?.querySelector('.cb-body')
      if (!body) return
      const ok = await copyText(body.innerText.replace(/\n$/, ''))
      const prev = btn.textContent
      btn.textContent = ok ? '복사됨 ✓' : '복사 실패'
      btn.classList.add('done')
      setTimeout(() => { btn.textContent = prev; btn.classList.remove('done') }, 1600)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [])

  return (
    <div ref={ref} className={`rich-body ${className}`} style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeRichBody(html || '') }} />
  )
}
