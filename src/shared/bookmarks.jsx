import { useEffect, useState } from 'react'
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, useToast } from './ui'

/* 자주 쓰는 AI 사이트 북마크 바 — 대시보드 공지사항 위에 한 줄로 표시.
   사용자별 목록은 user_bookmarks(jsonb)에 저장되며, 행이 없으면 기본 목록을 보여 준다. */
export const DEFAULT_BOOKMARKS = [
  { name: 'GPT', url: 'https://chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
  { name: 'Meta AI', url: 'https://www.meta.ai' },
  { name: 'AI Studio', url: 'https://aistudio.google.com' },
  { name: 'Github', url: 'https://github.com' },
  { name: 'Vercel', url: 'https://vercel.com' },
  { name: 'Supabase', url: 'https://supabase.com' },
  { name: 'Firebase', url: 'https://firebase.google.com' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com' },
  { name: 'Netlify', url: 'https://app.netlify.com' },
  { name: 'NotebookLM', url: 'https://notebook.google.com' },
]

function hostOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function faviconOf(url) {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : ''
}

function BookmarkLogo({ item, size = 26 }) {
  const [failed, setFailed] = useState(false)
  const src = faviconOf(item.url)
  if (!src || failed) {
    return <span className="bm-logo bm-logo-fallback" style={{ width: size, height: size }}>{(item.name || '?').slice(0, 1).toUpperCase()}</span>
  }
  return (
    <img className="bm-logo" src={src} alt="" width={size} height={size} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  )
}

export function AiBookmarks() {
  const { profile } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    supabase.from('user_bookmarks').select('items').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setItems(Array.isArray(data?.items) ? data.items : DEFAULT_BOOKMARKS)
      })
    return () => { alive = false }
  }, [profile?.id])

  function openEditor() {
    setDraft((items || DEFAULT_BOOKMARKS).map((b) => ({ ...b })))
    setOpen(true)
  }

  function updateDraft(i, patch) {
    setDraft((d) => d.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }
  function move(i, dir) {
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.length) return d
      const next = [...d]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    const cleaned = []
    for (const b of draft) {
      const name = (b.name || '').trim()
      let url = (b.url || '').trim()
      if (!name && !url) continue
      if (!name) { toast('이름이 비어 있는 북마크가 있습니다.', 'error'); return }
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url
      if (!hostOf(url)) { toast(`'${name}'의 URL 형식을 확인해 주세요.`, 'error'); return }
      cleaned.push({ name: name.slice(0, 20), url })
    }
    setBusy(true)
    const { error } = await supabase.from('user_bookmarks')
      .upsert({ user_id: profile.id, items: cleaned, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { toast('북마크 저장에 실패했습니다.', 'error'); return }
    setItems(cleaned)
    setOpen(false)
    toast('북마크가 저장되었습니다.')
  }

  async function resetDefaults() {
    setDraft(DEFAULT_BOOKMARKS.map((b) => ({ ...b })))
  }

  const list = items || DEFAULT_BOOKMARKS

  return (
    <section className="bm-bar" aria-label="AI 사이트 북마크">
      <div className="bm-list">
        {list.map((b, i) => (
          <a key={`${b.url}-${i}`} href={b.url} target="_blank" rel="noopener noreferrer" className="bm-item" title={b.name}>
            <BookmarkLogo item={b} />
            <span className="bm-name">{b.name}</span>
          </a>
        ))}
        {list.length === 0 && <span className="t-caption muted-soft" style={{ alignSelf: 'center' }}>북마크가 없습니다. + 버튼으로 추가하세요.</span>}
      </div>
      <button type="button" className="bm-add" onClick={openEditor} aria-label="북마크 추가·수정" title="북마크 추가·수정·삭제">
        <IconPlus size={18} stroke={2} />
      </button>

      <Dialog open={open} title="AI 사이트 북마크 관리" onClose={() => setOpen(false)}
        actions={
          <>
            <button className="btn btn-text btn-sm" onClick={resetDefaults} disabled={busy} style={{ marginRight: 'auto' }}>기본값으로</button>
            <button className="btn btn-white btn-sm" onClick={() => setOpen(false)} disabled={busy}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
          </>
        }>
        <div className="stack" style={{ gap: 8 }}>
          {draft.map((b, i) => (
            <div key={i} className="bm-edit-row">
              <BookmarkLogo item={b} size={22} />
              <input className="input" placeholder="이름" maxLength={20} value={b.name}
                onChange={(e) => updateDraft(i, { name: e.target.value })} style={{ width: 110, flexShrink: 0 }} />
              <input className="input" placeholder="https://..." value={b.url}
                onChange={(e) => updateDraft(i, { url: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
              <button className="icon-btn" title="위로" disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={14} stroke={1.75} /></button>
              <button className="icon-btn" title="아래로" disabled={i === draft.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={14} stroke={1.75} /></button>
              <button className="icon-btn danger" title="삭제" onClick={() => setDraft((d) => d.filter((_, x) => x !== i))}><IconTrash size={14} stroke={1.75} /></button>
            </div>
          ))}
          <button className="btn btn-white btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setDraft((d) => [...d, { name: '', url: '' }])}>
            <IconPlus size={14} stroke={1.75} /> 북마크 추가
          </button>
          <span className="hint">이름과 URL을 입력하세요. 로고는 사이트 파비콘으로 자동 표시됩니다.</span>
        </div>
      </Dialog>
    </section>
  )
}
