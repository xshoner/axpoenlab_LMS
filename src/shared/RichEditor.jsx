import { useEffect, useRef } from 'react'
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink, IconClearFormatting } from '@tabler/icons-react'

/* 경량 리치 텍스트 에디터 (강좌 본문·공지 작성용) */
export default function RichEditor({ value, onChange, minHeight = 200 }) {
  const ref = useRef(null)

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

  const tools = [
    { icon: IconBold, cmd: () => exec('bold'), label: '굵게' },
    { icon: IconItalic, cmd: () => exec('italic'), label: '기울임' },
    { icon: IconList, cmd: () => exec('insertUnorderedList'), label: '목록' },
    { icon: IconListNumbers, cmd: () => exec('insertOrderedList'), label: '번호 목록' },
    { icon: IconLink, cmd: addLink, label: '링크' },
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
