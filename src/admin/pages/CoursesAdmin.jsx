import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconFile, IconDownload, IconPaperclip } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import RichEditor from '../../shared/RichEditor'
import { ConfirmDialog, EmptyState, Loading, StatusPill, StarRating, useToast } from '../../shared/ui'
import { fmtBytes, pad2, downloadFile, uploadFile, storageSafeName } from '../../lib/helpers'

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
  const [ratingMap, setRatingMap] = useState({})
  const dragIdx = useRef(null)

  async function load() {
    const [{ data }, { data: stats }] = await Promise.all([
      supabase.from('master_courses').select('*, master_attachments(*)').order('sort_order'),
      supabase.from('course_rating_stats').select('master_course_id, avg_rating, rating_count')
        .not('master_course_id', 'is', null),
    ])
    // course_rating_stats 뷰가 마스터 강좌 단위로 전 기수 통합 평균을 제공한다 —
    // 같은 마스터의 기수 강좌 행들은 동일한 값이므로 첫 행만 사용
    const map = {}
    for (const s of stats || []) {
      if (s.master_course_id && !map[s.master_course_id]) {
        map[s.master_course_id] = { avg: Number(s.avg_rating), count: s.rating_count }
      }
    }
    setRatingMap(map)
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

  // 현재 나열 순서대로 sort_order를 다시 부여 (변경된 행만 갱신 — 번호는 표시하지 않음)
  async function persistOrder(list) {
    const updates = list
      .map((c, i) => ({ id: c.id, so: i + 1, changed: c.sort_order !== i + 1 }))
      .filter((u) => u.changed)
    if (updates.length === 0) return
    await Promise.all(updates.map((u) =>
      supabase.from('master_courses').update({ sort_order: u.so }).eq('id', u.id)))
  }

  async function dropAt(to) {
    const from = dragIdx.current
    dragIdx.current = null
    if (from == null || from === to) return
    const list = [...rows]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setRows(list.map((c, i) => ({ ...c, sort_order: i + 1 }))) // 낙관적 반영
    await persistOrder(list)
    load()
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
        <p className="t-muted-sm">재사용 가능한 강좌 라이브러리입니다. 기수 배정 시 과제·설문·퀴즈 구성과 함께 스냅샷으로 복제되며, 마스터 수정은 기배포 기수에 반영되지 않습니다. 카드를 드래그하면 배정 시 기본 순서가 바뀝니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><IconPlus size={14} stroke={1.75} /> 새 마스터 강좌</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="마스터 강좌가 없습니다" description="새 마스터 강좌를 만들어 라이브러리를 구성해 보세요."
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>새 마스터 강좌</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {rows.map((c, idx) => {
            const stat = ratingMap[c.id]
            return (
              <div key={c.id} className={`card-course theme-${idx % 6}`} onClick={() => setEditing(c)}
                draggable title="드래그하여 순서 변경"
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropAt(idx)}>
                <div className="row-between mb-8">
                  <span className="badge-role-soft">마스터</span>
                  <div className="row" style={{ gap: 4 }}>
                    {c.assignment_enabled && <StatusPill kind="neutral">과제</StatusPill>}
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </div>
                </div>
                <div className="t-h3 mb-8">{c.title}</div>
                <div className="t-muted-sm" style={{ minHeight: 40 }}>{c.summary}</div>
                <div className="card-course-meta">
                  {(c.master_attachments || []).length > 0 && (
                    <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.master_attachments.length}</span>
                  )}
                  {stat ? (
                    <span className="row" style={{ gap: 4 }} title="모든 기수 만족도 평균">
                      <StarRating value={stat.avg} size={13} showValue count={stat.count} />
                      <span className="t-caption muted-soft">전 기수 평균</span>
                    </span>
                  ) : (
                    <span className="t-caption muted-soft">아직 만족도 평가 없음</span>
                  )}
                </div>
              </div>
            )
          })}
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
  const dragIdx = useRef(null)

  const [ratingMap, setRatingMap] = useState({})

  async function load() {
    if (!selectedId) { setRows([]); return }
    const [{ data }, { data: stats }] = await Promise.all([
      supabase.from('cohort_courses').select('*, cohort_attachments(*)')
        .eq('cohort_id', selectedId).order('course_no'),
      supabase.from('course_rating_stats').select('cohort_course_id, avg_rating, rating_count')
        .eq('cohort_id', selectedId),
    ])
    const map = {}
    for (const s of stats || []) map[s.cohort_course_id] = s
    setRatingMap(map)
    setRows(data || [])
  }
  useEffect(() => { load() }, [selectedId])

  // 현재 나열 순서대로 course_no를 1부터 다시 부여 (변경된 행만 갱신)
  async function persistOrder(list) {
    const updates = list
      .map((c, i) => ({ id: c.id, no: i + 1, changed: c.course_no !== i + 1 }))
      .filter((u) => u.changed)
    if (updates.length === 0) return
    await Promise.all(updates.map((u) =>
      supabase.from('cohort_courses').update({ course_no: u.no }).eq('id', u.id)))
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('cohort_courses').delete().eq('id', deleteTarget.id)
    if (!error) await persistOrder(rows.filter((r) => r.id !== deleteTarget.id))
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else { toast('강좌가 삭제되었습니다. 남은 강좌 번호가 순서대로 재정렬되었습니다.'); setDeleteTarget(null); load() }
  }

  async function dropAt(to) {
    const from = dragIdx.current
    dragIdx.current = null
    if (from == null || from === to) return
    const list = [...rows]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setRows(list.map((c, i) => ({ ...c, course_no: i + 1 }))) // 낙관적 반영
    await persistOrder(list)
    load()
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
        <p className="t-muted-sm">{selected?.name}의 강좌입니다. 여기서의 수정·삭제는 다른 기수와 마스터에 영향을 주지 않습니다. 카드를 드래그하면 순서가 바뀌고 강좌 번호가 자동으로 재부여됩니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><IconPlus size={14} stroke={1.75} /> 새 강좌</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="이 기수에 강좌가 없습니다" description="기수 관리에서 마스터 강좌를 배정하거나 새 강좌를 직접 만들 수 있습니다."
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>새 강좌</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {rows.map((c, idx) => {
            const stat = ratingMap[c.id]
            const theme = ((Number(c.course_no) || idx + 1) - 1) % 6
            return (
              <div key={c.id} className={`card-course theme-${theme}`} onClick={() => setEditing(c)}
                draggable title="드래그하여 순서 변경"
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropAt(idx)}>
                <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
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
                <div className="card-course-meta">
                  {(c.cohort_attachments || []).length > 0 && (
                    <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.cohort_attachments.length}</span>
                  )}
                  {stat ? (
                    <span className="row" style={{ gap: 4 }} title="전 기수 통합 만족도 평균">
                      <StarRating value={stat.avg_rating} size={13} showValue count={stat.rating_count} />
                    </span>
                  ) : (
                    <span className="t-caption muted-soft">만족도 평가 없음</span>
                  )}
                </div>
              </div>
            )
          })}
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
  const [pending, setPending] = useState([]) // 저장 시 함께 업로드할 파일들
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)
  const attTable = isMaster ? 'master_attachments' : 'cohort_attachments'
  const fkCol = isMaster ? 'master_course_id' : 'cohort_course_id'

  async function save() {
    if (!form.title.trim()) { toast('강좌명을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      const base = {
        title: form.title.trim(), summary: form.summary.trim(), body: form.body,
        assignment_enabled: form.assignment_enabled,
        assignment_text: form.assignment_text,
        assignment_due: form.assignment_due ? new Date(form.assignment_due).toISOString() : null,
      }
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
      // 대기 중인 첨부파일 업로드 (한글 파일명은 안전한 경로명으로 저장)
      for (const file of pending) {
        const path = `${isMaster ? 'master' : cohortId}/${courseId}/${storageSafeName(file.name)}`
        await uploadFile('course-files', path, file)
        const { error } = await supabase.from(attTable)
          .insert({ [fkCol]: courseId, file_path: path, filename: file.name, file_size: file.size })
        if (error) throw error
      }
      toast('저장되었습니다.')
      onDone()
    } catch (e) {
      toast(`저장에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  function addPending(file) {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast('첨부는 파일당 최대 50MB입니다.', 'error'); return }
    setPending((p) => [...p, file])
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

      <div className="card-panel">
        <div className="checkbox-row mb-16">
          <input id="assign" type="checkbox" checked={form.assignment_enabled}
            onChange={(e) => setForm({ ...form, assignment_enabled: e.target.checked })} />
          <label htmlFor="assign" className="t-h3" style={{ color: 'var(--foreground)' }}>과제 사용</label>
          {isMaster && <span className="t-caption muted-soft">기수 배정 시 과제 설정이 함께 복제됩니다</span>}
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

      <div className="card-panel">
        <div className="row-between mb-16">
          <h3 className="t-h3">첨부파일 <span className="t-caption muted-soft">(파일당 최대 50MB)</span></h3>
          <button className="btn btn-white btn-sm" onClick={() => fileInput.current?.click()}>
            <IconPlus size={14} stroke={1.75} /> 파일 추가
          </button>
          <input ref={fileInput} type="file" hidden onChange={(e) => { addPending(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {attachments.length === 0 && pending.length === 0 ? (
          <p className="t-muted-sm">첨부파일이 없습니다. 파일을 추가하면 저장 시 함께 업로드됩니다.</p>
        ) : (
          <>
            {attachments.map((a) => (
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
            ))}
            {pending.map((f, i) => (
              <div key={`p-${i}`} className="attachment-row" style={{ background: 'var(--primary-tint)' }}>
                <IconFile size={18} stroke={1.75} color="var(--primary)" />
                <span>{f.name}</span>
                <span className="pill pill-neutral">저장 시 업로드</span>
                <span className="size">{fmtBytes(f.size)}</span>
                <button className="icon-btn danger" onClick={() => setPending((p) => p.filter((_, x) => x !== i))}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
