import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconPin, IconFile } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useCohort } from '../cohortContext'
import RichEditor from '../../shared/RichEditor'
import { ConfirmDialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, uploadFile } from '../../lib/helpers'

export default function NoticesAdmin() {
  const { profile } = useAuth()
  const { cohorts, selectedId } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function load() {
    let q = supabase.from('notices').select('*, cohorts(name), notice_attachments(*)')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false })
    if (selectedId) q = q.or(`cohort_id.eq.${selectedId},cohort_id.is.null`)
    const { data } = await q
    setRows(data || [])
  }
  useEffect(() => { load() }, [selectedId])

  async function remove() {
    const { error } = await supabase.from('notices').delete().eq('id', deleteTarget.id)
    if (error) toast('삭제 실패', 'error')
    else { toast('공지가 삭제되었습니다.'); setDeleteTarget(null); load() }
  }

  if (!rows) return <Loading />

  if (editing) {
    return <NoticeEditor notice={editing === 'new' ? null : editing} cohorts={cohorts} authorId={profile.id}
      onDone={() => { setEditing(null); load() }} />
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h2 className="t-h2">공지 관리</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><IconPlus size={14} stroke={1.75} /> 새 공지</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="등록된 공지가 없습니다"
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>새 공지</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>대상</th><th>등록일</th><th>조회수</th><th style={{ width: 180 }}>작업</th></tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.pinned && <IconPin size={14} stroke={1.75} color="var(--primary)" style={{ marginRight: 6 }} />}
                    <span className="t-emph">{n.title}</span>
                  </td>
                  <td>{n.cohort_id ? <StatusPill kind="neutral">{n.cohorts?.name}</StatusPill> : <StatusPill kind="done">전체</StatusPill>}</td>
                  <td className="tnum">{fmtDate(n.created_at)}</td>
                  <td className="tnum">{n.view_count}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-white btn-sm" onClick={() => setEditing(n)}>수정</button>
                      <button className="icon-btn danger" onClick={() => setDeleteTarget(n)}><IconTrash size={16} stroke={1.75} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} danger title="공지 삭제"
        message={`'${deleteTarget?.title}' 공지를 삭제합니다.`} confirmLabel="삭제"
        onConfirm={remove} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}

function NoticeEditor({ notice, cohorts, authorId, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: notice?.title || '',
    body: notice?.body || '',
    cohort_id: notice?.cohort_id || '',
    pinned: notice?.pinned || false,
  })
  const [attachments, setAttachments] = useState(notice?.notice_attachments || [])
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)

  async function save() {
    if (!form.title.trim()) { toast('제목을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      const payload = {
        title: form.title.trim(), body: form.body,
        cohort_id: form.cohort_id || null, pinned: form.pinned,
      }
      if (notice?.id) {
        const { error } = await supabase.from('notices').update(payload).eq('id', notice.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('notices').insert({ ...payload, created_by: authorId })
        if (error) throw error
      }
      toast('공지가 저장되었습니다.')
      onDone()
    } catch {
      toast('저장에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  async function addAttachment(file) {
    if (!file || !notice?.id) return
    try {
      const path = `notices/${notice.id}/${Date.now()}_${file.name}`
      await uploadFile('notice-files', path, file)
      const { data, error } = await supabase.from('notice_attachments')
        .insert({ notice_id: notice.id, file_path: path, filename: file.name, file_size: file.size })
        .select('*').single()
      if (error) throw error
      setAttachments((a) => [...a, data])
    } catch { toast('업로드 실패', 'error') }
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 860 }}>
      <div className="row-between">
        <h2 className="t-h2">{notice ? '공지 수정' : '새 공지'}</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={onDone}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
      <div className="card-panel">
        <div className="field">
          <label>제목 <span className="req">*</span></label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>게시 대상</label>
            <select className="select" value={form.cohort_id} onChange={(e) => setForm({ ...form, cohort_id: e.target.value })}>
              <option value="">전체</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>상단 고정</label>
            <div className="checkbox-row" style={{ height: 48 }}>
              <input id="pinned" type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
              <label htmlFor="pinned">목록 상단에 고정합니다</label>
            </div>
          </div>
        </div>
        <div className="field">
          <label>본문</label>
          <RichEditor value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} />
        </div>
      </div>
      <div className="card-panel">
        <div className="row-between mb-16">
          <h3 className="t-h3">첨부파일</h3>
          <button className="btn btn-white btn-sm" disabled={!notice?.id} onClick={() => fileInput.current?.click()}>
            <IconPlus size={14} stroke={1.75} /> 파일 추가
          </button>
          <input ref={fileInput} type="file" hidden onChange={(e) => { addAttachment(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {!notice?.id ? <p className="t-muted-sm">공지를 먼저 저장한 뒤 첨부할 수 있습니다.</p>
          : attachments.length === 0 ? <p className="t-muted-sm">첨부파일이 없습니다.</p>
            : attachments.map((a) => (
              <div key={a.id} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn danger" onClick={async () => {
                  await supabase.from('notice_attachments').delete().eq('id', a.id)
                  setAttachments((x) => x.filter((y) => y.id !== a.id))
                }}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </div>
            ))}
      </div>
    </div>
  )
}
