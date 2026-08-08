import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconFile, IconDownload, IconPaperclip } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import RichEditor from '../../shared/RichEditor'
import { ConfirmDialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtBytes, pad2, downloadFile, uploadFile } from '../../lib/helpers'

export default function CoursesAdmin() {
  const [tab, setTab] = useState('cohort') // cohort | master
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn-sm ${tab === 'cohort' ? 'btn-primary' : 'btn-white'}`} onClick={() => setTab('cohort')}>기수별 강좌</button>
        <button className={`btn btn-sm ${tab === 'master' ? 'btn-primary' : 'btn-white'}`} onClick={() => setTab('master')}>마스터 강좌 라이브러리</button>
      </div>
      {tab === 'cohort' ? <CohortCourses /> : <MasterCourses />}
    </div>
  )
}

/* ============ 마스터 강좌 ============ */
function MasterCourses() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('master_courses').select('*, master_attachments(*)').order('sort_order')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('master_courses').delete().eq('id', deleteTarget.id)
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else { toast('마스터 강좌가 삭제되었습니다. 기존 기수 강좌는 유지됩니다.'); setDeleteTarget(null); load() }
  }

  if (!rows) return <Loading />

  if (editing) {
    return <CourseEditor
      isMaster course={editing === 'new' ? null : editing}
      onDone={() => { setEditing(null); load() }}
    />
  }

  return (
    <>
      <div className="row-between">
        <p className="t-muted-sm">재사용 가능한 강좌 라이브러리입니다. 기수 배정 시 스냅샷으로 복제되며, 마스터 수정은 기배포 기수에 반영되지 않습니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><IconPlus size={14} stroke={1.75} /> 새 마스터 강좌</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="마스터 강좌가 없습니다" description="새 마스터 강좌를 만들어 라이브러리를 구성해 보세요."
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>새 마스터 강좌</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {rows.map((c) => (
            <div key={c.id} className="card-course" onClick={() => setEditing(c)}>
              <div className="row-between mb-8">
                <span className="badge-role-soft">마스터</span>
                <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </div>
              <div className="t-h3 mb-8">{c.title}</div>
              <div className="t-muted-sm" style={{ minHeight: 40 }}>{c.summary}</div>
              {(c.master_attachments || []).length > 0 && (
                <span className="pill pill-neutral mt-8"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.master_attachments.length}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="마스터 강좌 삭제"
        message={`'${deleteTarget?.title}' 마스터 강좌를 삭제합니다. 이미 기수에 배정된 강좌는 유지됩니다.`}
        confirmLabel="삭제" onConfirm={remove} onClose={() => setDeleteTarget(null)} />
    </>
  )
}

/* ============ 기수 강좌 ============ */
function CohortCourses() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedId) { setRows([]); return }
    const { data } = await supabase.from('cohort_courses').select('*, cohort_attachments(*)')
      .eq('cohort_id', selectedId).order('course_no')
    setRows(data || [])
  }
  useEffect(() => { load() }, [selectedId])

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('cohort_courses').delete().eq('id', deleteTarget.id)
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else { toast('강좌가 삭제되었습니다. 다른 기수에는 영향이 없습니다.'); setDeleteTarget(null); load() }
  }

  if (!selectedId) return <EmptyState title="기수를 선택해 주세요" description="상단의 기수 선택 드롭다운에서 기수를 선택하면 해당 기수의 강좌가 표시됩니다." />
  if (!rows) return <Loading />

  if (editing) {
    return <CourseEditor
      cohortId={selectedId}
      nextNo={rows.length ? Math.max(...rows.map((r) => r.course_no)) + 1 : 1}
      course={editing === 'new' ? null : editing}
      onDone={() => { setEditing(null); load() }}
    />
  }

  return (
    <>
      <div className="row-between">
        <p className="t-muted-sm">{selected?.name}의 강좌입니다. 여기서의 수정·삭제는 다른 기수와 마스터에 영향을 주지 않습니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><IconPlus size={14} stroke={1.75} /> 새 강좌</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="이 기수에 강좌가 없습니다" description="기수 관리에서 마스터 강좌를 배정하거나 새 강좌를 직접 만들 수 있습니다."
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>새 강좌</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {rows.map((c) => (
            <div key={c.id} className="card-course" onClick={() => setEditing(c)}>
              <div className="row-between mb-8">
                <span className="badge-course-no">{pad2(c.course_no)}</span>
                <div className="row" style={{ gap: 4 }}>
                  {c.assignment_enabled && <StatusPill kind="neutral">과제</StatusPill>}
                  <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}>
                    <IconTrash size={16} stroke={1.75} />
                  </button>
                </div>
              </div>
              <div className="t-h3 mb-8">{c.title}</div>
              <div className="t-muted-sm" style={{ minHeight: 40 }}>{c.summary}</div>
              {(c.cohort_attachments || []).length > 0 && (
                <span className="pill pill-neutral mt-8"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.cohort_attachments.length}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="강좌 삭제"
        message={`'${deleteTarget?.title}' 강좌를 이 기수에서 삭제합니다. 학생들의 열람·제출 기록도 함께 삭제됩니다.`}
        confirmLabel="삭제" onConfirm={remove} onClose={() => setDeleteTarget(null)} />
    </>
  )
}

/* ============ 강좌 편집기 (마스터/기수 공용) ============ */
function CourseEditor({ isMaster, cohortId, nextNo, course, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: course?.title || '',
    summary: course?.summary || '',
    body: course?.body || '',
    external_url: course?.external_url || '',
    course_no: course?.course_no || nextNo || 1,
    assignment_enabled: course?.assignment_enabled || false,
    assignment_text: course?.assignment_text || '',
    assignment_due: course?.assignment_due ? course.assignment_due.slice(0, 16) : '',
  })
  const [attachments, setAttachments] = useState(
    course ? (isMaster ? course.master_attachments : course.cohort_attachments) || [] : [],
  )
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)
  const attTable = isMaster ? 'master_attachments' : 'cohort_attachments'
  const fkCol = isMaster ? 'master_course_id' : 'cohort_course_id'

  async function save() {
    if (!form.title.trim()) { toast('강좌명을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      const base = { title: form.title.trim(), summary: form.summary.trim(), body: form.body }
      let courseId = course?.id
      if (isMaster) {
        if (courseId) {
          const { error } = await supabase.from('master_courses').update(base).eq('id', courseId)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from('master_courses').insert(base).select('id').single()
          if (error) throw error
          courseId = data.id
        }
      } else {
        const extended = {
          ...base,
          external_url: form.external_url.trim() || null,
          course_no: Number(form.course_no) || 1,
          assignment_enabled: form.assignment_enabled,
          assignment_text: form.assignment_text,
          assignment_due: form.assignment_due ? new Date(form.assignment_due).toISOString() : null,
        }
        if (courseId) {
          const { error } = await supabase.from('cohort_courses').update(extended).eq('id', courseId)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from('cohort_courses').insert({ ...extended, cohort_id: cohortId }).select('id').single()
          if (error) throw error
          courseId = data.id
        }
      }
      toast('저장되었습니다.')
      onDone()
    } catch {
      toast('저장에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  async function addAttachment(file) {
    if (!file || !course?.id) return
    if (file.size > 50 * 1024 * 1024) { toast('첨부는 파일당 최대 50MB입니다.', 'error'); return }
    try {
      const path = `${isMaster ? 'master' : cohortId}/${course.id}/${Date.now()}_${file.name}`
      await uploadFile('course-files', path, file)
      const { data, error } = await supabase.from(attTable)
        .insert({ [fkCol]: course.id, file_path: path, filename: file.name, file_size: file.size })
        .select('*').single()
      if (error) throw error
      setAttachments((a) => [...a, data])
      toast('첨부파일이 등록되었습니다.')
    } catch {
      toast('업로드에 실패했습니다.', 'error')
    }
  }

  async function removeAttachment(att) {
    await supabase.from(attTable).delete().eq('id', att.id)
    setAttachments((a) => a.filter((x) => x.id !== att.id))
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 860 }}>
      <div className="row-between">
        <h2 className="t-h2">{course ? '강좌 수정' : isMaster ? '새 마스터 강좌' : '새 강좌'}</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={onDone}>목록으로</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
      <div className="card-panel">
        <div className="grid-2">
          <div className="field">
            <label>강좌명 <span className="req">*</span></label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          {!isMaster && (
            <div className="field">
              <label>강좌 번호</label>
              <input className="input" type="number" min="1" value={form.course_no}
                onChange={(e) => setForm({ ...form, course_no: e.target.value })} />
            </div>
          )}
        </div>
        <div className="field">
          <label>한 줄 요약</label>
          <input className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="field">
          <label>본문</label>
          <RichEditor value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} />
        </div>
        {!isMaster && (
          <div className="field">
            <label>외부 링크 (선택)</label>
            <input className="input" placeholder="https://..." value={form.external_url}
              onChange={(e) => setForm({ ...form, external_url: e.target.value })} />
          </div>
        )}
      </div>

      {!isMaster && (
        <div className="card-panel">
          <div className="checkbox-row mb-16">
            <input id="assign" type="checkbox" checked={form.assignment_enabled}
              onChange={(e) => setForm({ ...form, assignment_enabled: e.target.checked })} />
            <label htmlFor="assign" className="t-h3" style={{ color: 'var(--foreground)' }}>과제 사용</label>
          </div>
          {form.assignment_enabled && (
            <>
              <div className="field">
                <label>과제 안내문</label>
                <textarea className="textarea" value={form.assignment_text}
                  onChange={(e) => setForm({ ...form, assignment_text: e.target.value })} />
              </div>
              <div className="field">
                <label>마감일</label>
                <input className="input" type="datetime-local" value={form.assignment_due}
                  onChange={(e) => setForm({ ...form, assignment_due: e.target.value })} />
                <span className="hint">마감 이후에도 제출은 항상 허용됩니다. (지각 표기 없음)</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card-panel">
        <div className="row-between mb-16">
          <h3 className="t-h3">첨부파일 <span className="t-caption muted-soft">(파일당 최대 50MB)</span></h3>
          <button className="btn btn-white btn-sm" disabled={!course?.id} onClick={() => fileInput.current?.click()}>
            <IconPlus size={14} stroke={1.75} /> 파일 추가
          </button>
          <input ref={fileInput} type="file" hidden onChange={(e) => { addAttachment(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {!course?.id ? (
          <p className="t-muted-sm">강좌를 먼저 저장한 뒤 첨부파일을 등록할 수 있습니다.</p>
        ) : attachments.length === 0 ? (
          <p className="t-muted-sm">첨부파일이 없습니다.</p>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="attachment-row">
              <IconFile size={18} stroke={1.75} color="var(--muted)" />
              <span>{a.filename}</span>
              <span className="size">{fmtBytes(a.file_size)}</span>
              <button className="icon-btn" onClick={() => downloadFile('course-files', a.file_path, a.filename)}>
                <IconDownload size={16} stroke={1.75} />
              </button>
              <button className="icon-btn danger" onClick={() => removeAttachment(a)}>
                <IconTrash size={16} stroke={1.75} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
