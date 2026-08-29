import { useEffect, useState } from 'react'
import { IconArrowLeft, IconDownload, IconTrash } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, downloadFile, pad2, asOne } from '../../lib/helpers'

export default function InquiriesAdmin() {
  const { profile } = useAuth()
  const { selectedId } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function load() {
    const { data } = await supabase.from('inquiries')
      .select('*, profiles(id, name, org, cohort_members(cohort_id, cohorts(name))), cohort_courses(course_no, title), inquiry_replies(*, profiles(name, nickname, role))')
      .order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  if (!rows) return <Loading />

  const filtered = rows
    .filter((r) => !selectedId || asOne(r.profiles?.cohort_members)?.cohort_id === selectedId)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1))

  const current = filtered.find((r) => r.id === openId)

  async function sendReply() {
    if (!reply.trim()) return
    setBusy(true)
    try {
      const { error } = await supabase.from('inquiry_replies').insert({
        inquiry_id: current.id, user_id: profile.id, body: reply.trim(),
      })
      if (error) throw error
      await supabase.from('inquiries').update({ status: 'answered' }).eq('id', current.id)
      toast('답변이 등록되었습니다.')
      setReply('')
      load()
    } catch {
      toast('답변 등록 실패', 'error')
    } finally { setBusy(false) }
  }

  async function deleteInquiry() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      if (deleteTarget.file_path) {
        await supabase.storage.from('inquiry-files').remove([deleteTarget.file_path])
      }
      const { error } = await supabase.from('inquiries').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast('문의가 삭제되었습니다.')
      if (openId === deleteTarget.id) setOpenId(null)
      setDeleteTarget(null)
      load()
    } catch {
      toast('문의 삭제 실패', 'error')
    } finally { setBusy(false) }
  }

  const confirmDialog = (
    <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="1:1 문의 삭제"
      message={`'${deleteTarget?.title}' 문의와 모든 답변을 영구 삭제합니다. 계속하시겠습니까?`}
      confirmLabel="삭제" onConfirm={deleteInquiry} onClose={() => setDeleteTarget(null)} />
  )

  if (current) {
    const replies = (current.inquiry_replies || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return (
      <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
        <div className="row-between">
          <button className="btn btn-text" onClick={() => setOpenId(null)}>
            <IconArrowLeft size={14} stroke={1.75} /> 목록으로
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(current)}>
            <IconTrash size={14} stroke={1.75} /> 문의 삭제
          </button>
        </div>
        <div className="card-panel">
          <div className="row-between mb-8">
            <h2 className="t-h2">{current.title}</h2>
            {current.status === 'answered' ? <StatusPill kind="done">답변 완료</StatusPill> : <StatusPill kind="open">답변 대기</StatusPill>}
          </div>
          <div className="t-caption muted-soft tnum mb-16">
            {current.profiles?.name} ({current.profiles?.org}) · {asOne(current.profiles?.cohort_members)?.cohorts?.name || '미배정'} · {fmtDate(current.created_at, true)}
            {current.cohort_courses && ` · 관련 강좌: ${pad2(current.cohort_courses.course_no)}. ${current.cohort_courses.title}`}
          </div>
          <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{current.body}</p>
          {current.file_path && (
            <button className="btn btn-white btn-sm mt-16"
              onClick={() => downloadFile('inquiry-files', current.file_path, current.filename).catch(() => toast('다운로드 실패', 'error'))}>
              <IconDownload size={14} stroke={1.75} /> {current.filename}
            </button>
          )}
        </div>
        {replies.map((r) => (
          <div key={r.id} className="card-panel" style={{ background: r.profiles?.role !== 'student' ? 'var(--primary-tint)' : 'var(--background)' }}>
            <div className="row mb-8" style={{ gap: 8 }}>
              <span className="t-label">
                {r.profiles?.role !== 'student' && r.profiles?.nickname ? `${r.profiles.nickname} (${r.profiles.name})` : r.profiles?.name}
              </span>
              {r.profiles?.role !== 'student' && <span className="badge-role-soft">운영진</span>}
              <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(r.created_at, true)}</span>
            </div>
            <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
          </div>
        ))}
        <div className="card-panel">
          <h3 className="t-h3 mb-8">답변 작성</h3>
          <textarea className="textarea mb-16" value={reply} onChange={(e) => setReply(e.target.value)} />
          <button className="btn btn-primary" onClick={sendReply} disabled={busy || !reply.trim()}>
            {busy ? '등록 중…' : '답변 등록'}
          </button>
        </div>
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2 className="t-h2">1:1 문의 관리 <span className="t-muted-sm tnum">(미답변 {filtered.filter((r) => r.status === 'open').length}건)</span></h2>
      {filtered.length === 0 ? (
        <EmptyState title="문의가 없습니다" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>작성자</th><th>기수</th><th>작성일</th><th>상태</th><th style={{ width: 48 }}></th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                  <td className="t-emph">{r.title}</td>
                  <td>{r.profiles?.name} <span className="t-caption muted-soft">({r.profiles?.org})</span></td>
                  <td className="t-muted-sm">{asOne(r.profiles?.cohort_members)?.cohorts?.name || '미배정'}</td>
                  <td className="tnum">{fmtDate(r.created_at, true)}</td>
                  <td>{r.status === 'answered' ? <StatusPill kind="done">답변 완료</StatusPill> : <StatusPill kind="open">답변 대기</StatusPill>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn danger" title="문의 삭제" onClick={() => setDeleteTarget(r)}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
