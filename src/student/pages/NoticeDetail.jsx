import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconDownload, IconFile } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { Loading, EmptyState, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, downloadFile, sanitizeRichBody } from '../../lib/helpers'

export default function NoticeDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    supabase.rpc('increment_notice_view', { p_notice_id: id }).then(() => {})
    supabase.from('notices').select('*, notice_attachments(*)').eq('id', id).single()
      .then(({ data }) => setNotice(data || false))
  }, [id])

  if (notice === null) return <Loading />
  if (notice === false) return <EmptyState title="공지를 찾을 수 없습니다" />

  return (
    <div className="stack" style={{ gap: 16 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>
      <div className="card-panel">
        <h1 className="t-h1 mb-8">{notice.title}</h1>
        <div className="t-caption muted-soft tnum mb-24">{fmtDate(notice.created_at, true)} · 조회 {notice.view_count}</div>
        <div className="rich-body" dangerouslySetInnerHTML={{ __html: sanitizeRichBody(notice.body || '') }} />
        {(notice.notice_attachments || []).length > 0 && (
          <div className="mt-24" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {notice.notice_attachments.map((a) => (
              <div key={a.id} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn" onClick={() => downloadFile('notice-files', a.file_path, a.filename).catch(() => toast('다운로드 실패', 'error'))}>
                  <IconDownload size={18} stroke={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
