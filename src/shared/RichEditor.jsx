import { useEffect, useRef, useState } from 'react'
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink, IconClearFormatting, IconPhoto } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { storageSafeName } from '../lib/helpers'

/* 경량 리치 텍스트 에디터 (강좌 본문·공지 작성용) */
export default function RichEditor({ value, onChange, minHeight = 200 }) {
  const ref = useRef(null)
  const imgInput = useRef(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
  }, [])

  function exec(cmd, arg) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    onChange(ref.current.innerHTML)
  }

  function addLink() {
    const url = prompt('링크 URL을 입력하세요 (https://...)')
    if (url && /^https?:\/\//.test(url)) exec('createLink', url)
  }

  // 이미지는 공개 버킷(course-images)에 업로드하고 public URL을 본문에 삽입한다.
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
    { icon: IconLink, cmd: addLink, label: '링크' },
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
        <input ref={imgInput} type="file" accept="image/*" hidden
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <div
        ref={ref}
        className="rich-body"
        contentEditable
        style={{ minHeight, padding: '12px 14px', outline: 'none', fontSize: 16 }}
        onInput={() => onChange(ref.current.innerHTML)}
        suppressContentEditableWarning
      />
    </div>
  )
}
