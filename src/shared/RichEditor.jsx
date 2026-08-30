import { useEffect, useRef, useState } from 'react'
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink, IconClearFormatting, IconPhoto, IconBrandYoutube, IconTerminal2, IconSparkles } from '@tabler/icons-react'
import { Dialog } from './ui'
import { supabase } from '../lib/supabase'
import { storageSafeName } from '../lib/helpers'

const URL_RE = /^https?:\/\/\S+$/i

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 외부 URL 스크린샷 썸네일 (WordPress mshots — 무료 공개 서비스, 400×300)
function thumbnailUrl(url) {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=400&h=300`
}

// 유튜브 URL에서 영상 ID 추출 (watch / youtu.be / shorts / live / embed 지원)
export function youtubeId(url) {
  try {
    const u = new URL(url)
    let id = null
    if (/(^|\.)youtu\.be$/.test(u.hostname)) {
      id = u.pathname.slice(1).split('/')[0]
    } else if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/)
        if (m) id = m[2]
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

function videoEmbedHtml(id) {
  return (
    `<div class="video-embed" contenteditable="false">` +
    `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube 동영상" ` +
    `frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
    `allowfullscreen></iframe></div><p><br></p>`
  )
}

// 복사 블록 — 명령어(code) / 실습 프롬프트(prompt). 학생 화면(RichBody)에서 [복사] 버튼이 동작한다.
const COPY_KINDS = {
  code: { label: '명령어', btn: '복사', title: '명령어 블록 (복사 버튼 포함)', placeholder: 'npm install -g @anthropic-ai/claude-code' },
  prompt: { label: '실습 프롬프트', btn: '프롬프트 복사', title: '프롬프트 블록 (복사 버튼 포함)', placeholder: '다음 웹앱을 만들어라...' },
}
function copyBlockHtml(kind, text, label) {
  const k = COPY_KINDS[kind] || COPY_KINDS.code
  const safeText = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return (
    `<div class="copy-block" data-kind="${kind}" contenteditable="false">` +
    `<div class="cb-head"><span class="cb-label">${escAttr(label || k.label)}</span>` +
    `<button type="button" class="cb-copy">${escAttr(k.btn)}</button></div>` +
    `<pre class="cb-body" contenteditable="true">${safeText}</pre></div><p><br></p>`
  )
}

function linkPreviewHtml(url) {
  const safe = escAttr(url)
  const thumb = escAttr(thumbnailUrl(url))
  return (
    `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>` +
    `<a class="link-preview" href="${safe}" target="_blank" rel="noopener noreferrer" contenteditable="false">` +
    `<img src="${thumb}" data-thumb="${thumb}" alt="링크 미리보기" loading="lazy" />` +
    `<span class="lp-url">${safe}</span></a><p><br></p>`
  )
}

/* 경량 리치 텍스트 에디터 (강좌 본문·공지 작성용)
   URL을 붙여넣거나 링크 버튼으로 넣으면 400×300 썸네일 미리보기 카드가 자동 삽입됩니다. */
export default function RichEditor({ value, onChange, minHeight = 200, compact = false }) {
  const ref = useRef(null)
  const imgInput = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [copyDlg, setCopyDlg] = useState(null) // { kind, text, label }

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
    // 이전 세션에서 넣어둔 미리보기가 아직 생성 중이었다면 다시 갱신을 시도한다
    const thumbs = new Set()
    for (const img of ref.current?.querySelectorAll('img[data-thumb]') || []) {
      thumbs.add(img.dataset.thumb)
    }
    thumbs.forEach((t) => pollThumbnail(t))
  }, [])

  function exec(cmd, arg) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    onChange(ref.current.innerHTML)
  }

  function isValidUrl(url) {
    if (!URL_RE.test(url)) return false
    try {
      const u = new URL(url)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch { return false }
  }

  // mshots는 스냅샷 생성 전까지 로딩 GIF로 307 리다이렉트한다.
  // CORS 헤더가 없어 내용은 못 읽지만, no-cors + redirect:'manual'로
  // "아직 리다이렉트 중인지"(opaqueredirect)만은 판별 가능 —
  // 준비되면 캐시 우회 파라미터로 이미지를 강제 새로고침한다.
  function pollThumbnail(thumbUrl) {
    let tries = 0
    const tick = async () => {
      tries += 1
      let ready = false
      try {
        const res = await fetch(thumbUrl, { mode: 'no-cors', redirect: 'manual', cache: 'no-store' })
        ready = res.type !== 'opaqueredirect'
      } catch { ready = false }
      if (ready) {
        const imgs = ref.current?.querySelectorAll('img[data-thumb]') || []
        for (const img of imgs) {
          if (img.dataset.thumb === thumbUrl) img.src = `${thumbUrl}&r=${tries}`
        }
        if (ref.current) onChange(ref.current.innerHTML)
        return
      }
      if (tries < 20) setTimeout(tick, 3000)
    }
    setTimeout(tick, 3000)
  }

  function insertPreview(url) {
    exec('insertHTML', linkPreviewHtml(url))
    pollThumbnail(thumbnailUrl(url))
  }

  function addLink() {
    const url = prompt('링크 URL을 입력하세요 (https://...)\n썸네일 미리보기가 함께 삽입됩니다.')
    if (!url) return
    const trimmed = url.trim()
    if (!isValidUrl(trimmed)) { alert('http:// 또는 https:// 로 시작하는 URL만 넣을 수 있습니다.'); return }
    const yt = youtubeId(trimmed)
    if (yt) { exec('insertHTML', videoEmbedHtml(yt)); return }
    insertPreview(trimmed)
  }

  // 텍스트 링크(버튼처럼 보이는 링크) — 쪽지용. 예: "아래 사이트에 접속하세요 [Gemini 열기]"
  function addTextLink() {
    const url = prompt('링크 URL을 입력하세요 (https://...)')
    if (!url) return
    const trimmed = url.trim()
    if (!isValidUrl(trimmed)) { alert('http:// 또는 https:// 로 시작하는 URL만 넣을 수 있습니다.'); return }
    const sel = window.getSelection()?.toString().trim()
    const label = sel || prompt('링크에 표시할 이름을 입력하세요', '링크 열기')
    if (label == null) return
    const safe = escAttr(trimmed)
    exec('insertHTML', `<a class="link-btn" href="${safe}" target="_blank" rel="noopener noreferrer">${escAttr(label.trim() || trimmed)}</a>&nbsp;`)
  }

  function addVideo() {
    const url = prompt('유튜브 동영상 URL을 입력하세요.\n예: https://www.youtube.com/watch?v=... 또는 https://youtu.be/...')
    if (!url) return
    const yt = youtubeId(url.trim())
    if (!yt) { alert('유튜브 URL을 인식하지 못했습니다. 영상 주소를 다시 확인해 주세요.'); return }
    exec('insertHTML', videoEmbedHtml(yt))
  }

  // URL만 붙여넣으면: 유튜브 URL은 동영상 임베드, 그 외는 링크 + 썸네일 미리보기 카드
  function onPaste(e) {
    const text = e.clipboardData?.getData('text/plain')?.trim()
    if (text && isValidUrl(text) && !/\s/.test(text)) {
      e.preventDefault()
      const yt = youtubeId(text)
      if (yt) exec('insertHTML', videoEmbedHtml(yt))
      else insertPreview(text)
    }
  }

  // 이미지는 공개 버킷(course-images)에 업로드하고 public URL을 본문에 삽입한다.
  // (강좌 본문 이미지 전용 — 개인정보성 파일은 비공개 버킷 + 서명 URL 사용)
  async function insertImage(file) {
    if (!file) return
    if (!/^image\//.test(file.type)) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    if (file.size > 10 * 1024 * 1024) { alert('이미지는 최대 10MB까지 업로드할 수 있습니다.'); return }
    setUploading(true)
    try {
      const path = `body/${storageSafeName(file.name)}`
      const { error } = await supabase.storage.from('course-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('course-images').getPublicUrl(path)
      exec('insertImage', data.publicUrl)
    } catch (e) {
      alert(`이미지 업로드에 실패했습니다. ${e?.message || ''}`)
    } finally {
      setUploading(false)
    }
  }

  function insertCopyBlock() {
    if (!copyDlg?.text.trim()) return
    exec('insertHTML', copyBlockHtml(copyDlg.kind, copyDlg.text.replace(/\s+$/, ''), copyDlg.label.trim()))
    setCopyDlg(null)
  }

  // compact(쪽지 등 짧은 본문): 이미지·동영상 도구를 숨기고 링크는 미리보기 카드 없이 텍스트 링크만 삽입
  const tools = [
    { icon: IconBold, cmd: () => exec('bold'), label: '굵게' },
    { icon: IconItalic, cmd: () => exec('italic'), label: '기울임' },
    { icon: IconList, cmd: () => exec('insertUnorderedList'), label: '목록' },
    { icon: IconListNumbers, cmd: () => exec('insertOrderedList'), label: '번호 목록' },
    { icon: IconLink, cmd: compact ? addTextLink : addLink, label: compact ? '링크 삽입' : '링크 + 미리보기' },
    !compact && { icon: IconBrandYoutube, cmd: addVideo, label: '유튜브 동영상 삽입' },
    !compact && { icon: IconPhoto, cmd: () => imgInput.current?.click(), label: '이미지 삽입' },
    { icon: IconTerminal2, cmd: () => setCopyDlg({ kind: 'code', text: '', label: '' }), label: '명령어 블록 (복사 버튼)' },
    { icon: IconSparkles, cmd: () => setCopyDlg({ kind: 'prompt', text: '', label: '' }), label: '프롬프트 블록 (복사 버튼)' },
    { icon: IconClearFormatting, cmd: () => exec('removeFormat'), label: '서식 지우기' },
  ].filter(Boolean)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div className="row" style={{ gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {tools.map(({ icon: Icon, cmd, label }) => (
          <button key={label} type="button" className="icon-btn" onClick={cmd} title={label} aria-label={label} style={{ width: 32, height: 32 }}>
            <Icon size={16} stroke={1.75} />
          </button>
        ))}
        {uploading && <span className="t-caption muted-soft" style={{ marginLeft: 8 }}>이미지 업로드 중…</span>}
        {!compact && <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>URL 붙여넣기 시 미리보기 자동 삽입</span>}
        <input ref={imgInput} type="file" accept="image/*" hidden
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <div
        ref={ref}
        className="rich-body"
        contentEditable
        style={{ minHeight, padding: '12px 14px', outline: 'none', fontSize: 16 }}
        onInput={() => onChange(ref.current.innerHTML)}
        onPaste={compact ? undefined : onPaste}
        suppressContentEditableWarning
      />
      <Dialog open={!!copyDlg} title={copyDlg ? COPY_KINDS[copyDlg.kind].title : ''} onClose={() => setCopyDlg(null)}
        actions={
          <>
            <button type="button" className="btn btn-white btn-sm" onClick={() => setCopyDlg(null)}>취소</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!copyDlg?.text.trim()} onClick={insertCopyBlock}>삽입</button>
          </>
        }>
        {copyDlg && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>
              {Object.entries(COPY_KINDS).map(([k, v]) => (
                <button key={k} type="button" className={`btn btn-sm ${copyDlg.kind === k ? 'btn-primary' : 'btn-white'}`}
                  onClick={() => setCopyDlg({ ...copyDlg, kind: k })}>{v.label}</button>
              ))}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>블록 제목 <span className="t-caption muted-soft">(선택 — 비우면 "{COPY_KINDS[copyDlg.kind].label}")</span></label>
              <input className="input" maxLength={40} value={copyDlg.label} placeholder="예: Claude Code 설치, 실습 1 프롬프트"
                onChange={(e) => setCopyDlg({ ...copyDlg, label: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>복사될 내용</label>
              <textarea className="textarea" autoFocus style={{ minHeight: 140, fontFamily: copyDlg.kind === 'code' ? 'ui-monospace, Consolas, monospace' : 'inherit', fontSize: 13 }}
                placeholder={COPY_KINDS[copyDlg.kind].placeholder} value={copyDlg.text}
                onChange={(e) => setCopyDlg({ ...copyDlg, text: e.target.value })} />
              <span className="hint">학생 화면에서 블록 오른쪽 위 [{COPY_KINDS[copyDlg.kind].btn}] 버튼으로 한 번에 복사됩니다. 삽입 후에도 블록 안의 글자는 직접 수정할 수 있습니다.</span>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
