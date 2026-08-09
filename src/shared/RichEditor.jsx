import { useEffect, useRef, useState } from 'react'
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink, IconClearFormatting, IconPhoto } from '@tabler/icons-react'
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

function linkPreviewHtml(url) {
  const safe = escAttr(url)
  const thumb = escAttr(thumbnailUrl(url))
  return (
    `<a href="${safe}">${safe}</a>` +
    `<a class="link-preview" href="${safe}" target="_blank" rel="noopener noreferrer" contenteditable="false">` +
    `<img src="${thumb}" data-thumb="${thumb}" alt="링크 미리보기" loading="lazy" />` +
    `<span class="lp-url">${safe}</span></a><p><br></p>`
  )
}

/* 경량 리치 텍스트 에디터 (강좌 본문·공지 작성용)
   URL을 붙여넣거나 링크 버튼으로 넣으면 400×300 썸네일 미리보기 카드가 자동 삽입됩니다. */
export default function RichEditor({ value, onChange, minHeight = 200 }) {
  const ref = useRef(null)
  const imgInput = useRef(null)
  const [uploading, setUploading] = useState(false)

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
    insertPreview(trimmed)
  }

  // URL만 붙여넣으면 링크 + 썸네일 미리보기 카드로 변환
  function onPaste(e) {
    const text = e.clipboardData?.getData('text/plain')?.trim()
    if (text && isValidUrl(text) && !/\s/.test(text)) {
      e.preventDefault()
      insertPreview(text)
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

  const tools = [
    { icon: IconBold, cmd: () => exec('bold'), label: '굵게' },
    { icon: IconItalic, cmd: () => exec('italic'), label: '기울임' },
    { icon: IconList, cmd: () => exec('insertUnorderedList'), label: '목록' },
    { icon: IconListNumbers, cmd: () => exec('insertOrderedList'), label: '번호 목록' },
    { icon: IconLink, cmd: addLink, label: '링크 + 미리보기' },
    { icon: IconPhoto, cmd: () => imgInput.current?.click(), label: '이미지 삽입' },
    { icon: IconClearFormatting, cmd: () => exec('removeFormat'), label: '서식 지우기' },
  ]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div className="row" style={{ gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {tools.map(({ icon: Icon, cmd, label }) => (
          <button key={label} type="button" className="icon-btn" onClick={cmd} title={label} aria-label={label} style={{ width: 32, height: 32 }}>
            <Icon size={16} stroke={1.75} />
          </button>
        ))}
        {uploading && <span className="t-caption muted-soft" style={{ marginLeft: 8 }}>이미지 업로드 중…</span>}
        <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>URL 붙여넣기 시 미리보기 자동 삽입</span>
        <input ref={imgInput} type="file" accept="image/*" hidden
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <div
        ref={ref}
        className="rich-body"
        contentEditable
        style={{ minHeight, padding: '12px 14px', outline: 'none', fontSize: 16 }}
        onInput={() => onChange(ref.current.innerHTML)}
        onPaste={onPaste}
        suppressContentEditableWarning
      />
    </div>
  )
}
