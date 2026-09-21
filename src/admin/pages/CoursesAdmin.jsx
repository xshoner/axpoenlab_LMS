import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IconPlus, IconTrash, IconFile, IconDownload, IconPaperclip, IconPencil,
  IconExternalLink, IconArrowsMove, IconCopy, IconFolder, IconEye, IconEyeOff,
} from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import RichEditor from '../../shared/RichEditor'
import RichBody from '../../shared/RichBody'
import { ConfirmDialog, Dialog, EmptyState, Loading, StatusPill, StarRating, useToast } from '../../shared/ui'
import { fmtBytes, fmtDate, pad2, downloadFile, uploadFile, storageSafeName } from '../../lib/helpers'
import { useDraft, DraftBadge } from '../../shared/draft'

export default function CoursesAdmin() {
  const location = useLocation()
  const navigate = useNavigate()
  const detailMatch = location.pathname.match(/^\/courses\/(master|cohort)\/([^/]+)$/)
  const detailType = detailMatch?.[1] || null
  const detailId = detailMatch?.[2] || null
  const [tab, setTab] = useState(detailType || 'master') // cohort | master

  useEffect(() => {
    if (detailType) setTab(detailType)
  }, [detailType])

  const openCourse = (type, course) => navigate(`/courses/${type}/${course.id}`)
  const closeCourse = () => navigate('/courses', { replace: true })
  const selectTab = (nextTab) => {
    setTab(nextTab)
    if (detailId) navigate('/courses', { replace: true })
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn-sm ${tab === 'cohort' ? 'btn-primary' : 'btn-white'}`} onClick={() => selectTab('cohort')}>기수별 강좌</button>
        <button className={`btn btn-sm ${tab === 'master' ? 'btn-primary' : 'btn-white'}`} onClick={() => selectTab('master')}>마스터 강좌 라이브러리</button>
      </div>
      {tab === 'cohort'
        ? <CohortCourses detailId={detailType === 'cohort' ? detailId : null} onOpen={(course) => openCourse('cohort', course)} onClose={closeCourse} />
        : <MasterCourses detailId={detailType === 'master' ? detailId : null} onOpen={(course) => openCourse('master', course)} onClose={closeCourse} />}
    </div>
  )
}

/* ============ 마스터 강좌 ============ */
function MasterCourses({ detailId, onOpen, onClose }) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [editing, setEditing] = useState(null)
  const [mode, setMode] = useState('view') // view | edit — 기존 강좌는 읽기 화면이 기본
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const dragIdx = useRef(null)

  async function loadGroups(preferredId) {
    const { data, error } = await supabase.from('master_course_groups').select('*').order('sort_order').order('created_at')
    if (error) { toast('강좌 그룹을 불러오지 못했습니다.', 'error'); setGroups([]); return }
    const next = data || []
    setGroups(next)
    setGroupId((current) => {
      if (preferredId && next.some((group) => group.id === preferredId)) return preferredId
      if (current && next.some((group) => group.id === current)) return current
      return next.find((group) => group.is_default)?.id || next[0]?.id || ''
    })
  }
  useEffect(() => { loadGroups() }, [])

  async function load() {
    if (!groupId) { setRows([]); return }
    setRows(null)
    const { data, error } = await supabase.rpc('admin_master_course_list', { p_group_id: groupId })
    if (error) { toast('강좌 목록을 불러오지 못했습니다.', 'error'); setRows([]); return }
    setRows(data || [])
  }
  useEffect(() => { if (groupId) load() }, [groupId])

  useEffect(() => {
    if (!detailId) {
      setEditing((current) => current === 'new' ? current : null)
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('master_courses')
        .select('*, master_attachments(*)').eq('id', detailId).single()
      if (!alive) return
      if (error || !data) { toast('강좌 상세 정보를 불러오지 못했습니다.', 'error'); onClose(); return }
      if (data.group_id) setGroupId(data.group_id)
      setMode('view')
      setEditing(data)
    })()
    return () => { alive = false }
  }, [detailId])

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('master_courses').delete().eq('id', deleteTarget.id)
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else {
      toast('마스터 강좌가 삭제되었습니다. 기존 기수 강좌는 유지됩니다.')
      setRows((current) => (current || []).filter((row) => row.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
  }

  async function dropAt(to) {
    const from = dragIdx.current
    dragIdx.current = null
    if (from == null || from === to) return
    const previous = rows
    const list = [...previous]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const optimistic = list.map((course, index) => ({ ...course, sort_order: index + 1 }))
    setRows(optimistic)
    const { error } = await supabase.rpc('admin_reorder_master_courses', {
      p_group_id: groupId, p_ids: optimistic.map((course) => course.id),
    })
    if (error) { setRows(previous); toast('강좌 순서를 저장하지 못했습니다.', 'error') }
  }

  if (!groups || (detailId && !editing)) return <Loading />

  if (editing) {
    if (editing !== 'new' && mode === 'view') {
      return <CourseAdminView
        isMaster course={editing}
        onBack={() => { setEditing(null); onClose() }}
        onEdit={() => setMode('edit')}
      />
    }
    return <CourseEditor
      isMaster groupId={groupId}
      nextNo={rows?.length ? Math.max(...rows.map((row) => row.sort_order)) + 1 : 1}
      course={editing === 'new' ? null : editing}
      onDone={() => { setEditing(null); onClose(); load() }}
    />
  }

  return (
    <>
      <CourseGroupBar
        scope="master" groups={groups} groupId={groupId} onSelect={setGroupId}
        onChanged={loadGroups}
      />
      <div className="row-between">
        <p className="t-muted-sm">선택한 그룹의 재사용 가능한 강좌입니다. 기수 배정 시 그룹과 세부 강좌 구성이 함께 복제됩니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => { setMode('edit'); setEditing('new') }}><IconPlus size={14} stroke={1.75} /> 새 마스터 강좌</button>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? (
        <EmptyState title="마스터 강좌가 없습니다" description="새 마스터 강좌를 만들어 라이브러리를 구성해 보세요."
          action={<button className="btn btn-primary btn-sm" onClick={() => { setMode('edit'); setEditing('new') }}>새 마스터 강좌</button>} />
      ) : (
        <div className="course-grid">
          {rows.map((c, idx) => {
            return (
              <div key={c.id} className={`card-course theme-${idx % 6}`} onClick={() => { setMode('view'); onOpen(c) }}
                draggable title="드래그하여 순서 변경"
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropAt(idx)}>
                <div className="row-between mb-8">
                  <span className="badge-role-soft">마스터</span>
                  <div className="row" style={{ gap: 4 }}>
                    {c.assignment_enabled && <StatusPill kind="neutral">과제</StatusPill>}
                    <button className="icon-btn" title="다른 그룹으로 이동 또는 복사" aria-label={`${c.title} 이동 또는 복사`}
                      onClick={(e) => { e.stopPropagation(); setMoveTarget(c) }}>
                      <IconArrowsMove size={16} stroke={1.75} />
                    </button>
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </div>
                </div>
                <div className="t-h3 mb-8">{c.title}</div>
                <div className="t-muted-sm" style={{ minHeight: 40 }}>{c.summary}</div>
                <div className="card-course-meta">
                  {c.attachment_count > 0 && (
                    <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.attachment_count}</span>
                  )}
                  {c.rating_count > 0 ? (
                    <span className="row" style={{ gap: 4 }} title="모든 기수 만족도 평균">
                      <StarRating value={Number(c.avg_rating)} size={13} showValue count={c.rating_count} />
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
      <MoveCourseDialog scope="master" course={moveTarget} groups={groups} currentGroupId={groupId}
        onClose={() => setMoveTarget(null)} onDone={() => { setMoveTarget(null); load() }} />
    </>
  )
}

/* ============ 기수 강좌 ============ */
function CohortCourses({ detailId, onOpen, onClose }) {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [editing, setEditing] = useState(null)
  const [mode, setMode] = useState('view') // view | edit — 기존 강좌는 읽기 화면이 기본
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const dragIdx = useRef(null)

  async function loadGroups(preferredId) {
    if (!selectedId) { setGroups([]); setGroupId(''); return }
    const { data, error } = await supabase.from('cohort_course_groups').select('*')
      .eq('cohort_id', selectedId).order('sort_order').order('created_at')
    if (error) { toast('강좌 그룹을 불러오지 못했습니다.', 'error'); setGroups([]); return }
    const next = data || []
    setGroups(next)
    setGroupId((current) => {
      if (preferredId && next.some((group) => group.id === preferredId)) return preferredId
      if (current && next.some((group) => group.id === current)) return current
      return next.find((group) => group.is_default)?.id || next[0]?.id || ''
    })
  }
  useEffect(() => { setRows(null); setEditing(null); loadGroups() }, [selectedId])

  async function load() {
    if (!selectedId || !groupId) { setRows([]); return }
    setRows(null)
    const { data, error } = await supabase.rpc('admin_cohort_course_list', {
      p_cohort_id: selectedId, p_group_id: groupId,
    })
    if (error) { toast('강좌 목록을 불러오지 못했습니다.', 'error'); setRows([]); return }
    setRows(data || [])
  }
  useEffect(() => { if (selectedId && groupId) load() }, [selectedId, groupId])

  useEffect(() => {
    if (!detailId) {
      setEditing((current) => current === 'new' ? current : null)
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('cohort_courses')
        .select('*, cohort_attachments(*)').eq('id', detailId).single()
      if (!alive) return
      if (error || !data) { toast('강좌 상세 정보를 불러오지 못했습니다.', 'error'); onClose(); return }
      if (data.group_id) setGroupId(data.group_id)
      setMode('view')
      setEditing(data)
    })()
    return () => { alive = false }
  }, [detailId])

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('cohort_courses').delete().eq('id', deleteTarget.id)
    if (!error) {
      const remaining = rows.filter((row) => row.id !== deleteTarget.id)
      await supabase.rpc('admin_reorder_cohort_courses', {
        p_group_id: groupId, p_ids: remaining.map((row) => row.id),
      })
      setRows(remaining.map((row, index) => ({ ...row, course_no: index + 1 })))
    }
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else { toast('강좌가 삭제되었습니다. 남은 강좌 번호가 순서대로 재정렬되었습니다.'); setDeleteTarget(null) }
  }

  async function dropAt(to) {
    const from = dragIdx.current
    dragIdx.current = null
    if (from == null || from === to) return
    const previous = rows
    const list = [...previous]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const optimistic = list.map((course, index) => ({ ...course, course_no: index + 1 }))
    setRows(optimistic)
    const { error } = await supabase.rpc('admin_reorder_cohort_courses', {
      p_group_id: groupId, p_ids: optimistic.map((course) => course.id),
    })
    if (error) { setRows(previous); toast('강좌 순서를 저장하지 못했습니다.', 'error') }
  }

  if (!selectedId) return <EmptyState title="기수를 선택해 주세요" description="상단의 기수 선택 드롭다운에서 기수를 선택하면 해당 기수의 강좌가 표시됩니다." />
  if (!groups || (detailId && !editing)) return <Loading />

  if (editing) {
    if (editing !== 'new' && mode === 'view') {
      return <CourseAdminView
        course={editing}
        onBack={() => { setEditing(null); onClose() }}
        onEdit={() => setMode('edit')}
      />
    }
    return <CourseEditor
      cohortId={selectedId}
      groupId={groupId}
      nextNo={rows?.length ? Math.max(...rows.map((r) => r.course_no)) + 1 : 1}
      course={editing === 'new' ? null : editing}
      onDone={() => { setEditing(null); onClose(); load() }}
    />
  }

  return (
    <>
      <CourseGroupBar
        scope="cohort" cohortId={selectedId} groups={groups} groupId={groupId}
        onSelect={setGroupId} onChanged={loadGroups}
      />
      <div className="row-between">
        <p className="t-muted-sm">{selected?.name}의 선택한 강좌 그룹입니다. 그룹별로 공개 여부와 모듈 순서를 관리할 수 있습니다.</p>
        <button className="btn btn-primary btn-sm" onClick={() => { setMode('edit'); setEditing('new') }}><IconPlus size={14} stroke={1.75} /> 새 강좌</button>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? (
        <EmptyState title="이 기수에 강좌가 없습니다" description="기수 관리에서 마스터 강좌를 배정하거나 새 강좌를 직접 만들 수 있습니다."
          action={<button className="btn btn-primary btn-sm" onClick={() => { setMode('edit'); setEditing('new') }}>새 강좌</button>} />
      ) : (
        <div className="course-grid">
          {rows.map((c, idx) => {
            const theme = ((Number(c.course_no) || idx + 1) - 1) % 6
            return (
              <div key={c.id} className={`card-course theme-${theme}`} onClick={() => { setMode('view'); onOpen(c) }}
                draggable title="드래그하여 순서 변경"
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropAt(idx)}>
                <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
                <div className="row-between mb-8">
                  <span className="badge-course-no">{pad2(c.course_no)}</span>
                  <div className="row" style={{ gap: 4 }}>
                    {c.assignment_enabled && <StatusPill kind="neutral">과제</StatusPill>}
                    <button className="icon-btn" title="다른 그룹으로 이동 또는 복사" aria-label={`${c.title} 이동 또는 복사`}
                      onClick={(e) => { e.stopPropagation(); setMoveTarget(c) }}>
                      <IconArrowsMove size={16} stroke={1.75} />
                    </button>
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </div>
                </div>
                <div className="t-h3 mb-8">{c.title}</div>
                <div className="t-muted-sm" style={{ minHeight: 40 }}>{c.summary}</div>
                <div className="card-course-meta">
                  {c.attachment_count > 0 && (
                    <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.attachment_count}</span>
                  )}
                  {c.rating_count > 0 ? (
                    <span className="row" style={{ gap: 4 }} title="전 기수 통합 만족도 평균">
                      <StarRating value={Number(c.avg_rating)} size={13} showValue count={c.rating_count} />
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
      <MoveCourseDialog scope="cohort" course={moveTarget} groups={groups} currentGroupId={groupId}
        onClose={() => setMoveTarget(null)} onDone={() => { setMoveTarget(null); load() }} />
    </>
  )
}

function CourseGroupBar({ scope, cohortId, groups, groupId, onSelect, onChanged }) {
  const toast = useToast()
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const current = groups.find((group) => group.id === groupId)
  const table = scope === 'master' ? 'master_course_groups' : 'cohort_course_groups'

  function openCreate() {
    setName('')
    setDialog('create')
  }

  function openRename() {
    setName(current?.name || '')
    setDialog('rename')
  }

  async function saveGroup() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    const maxOrder = groups.reduce((max, group) => Math.max(max, Number(group.sort_order) || 0), 0)
    const result = dialog === 'create'
      ? await supabase.from(table).insert(scope === 'master'
        ? { name: trimmed, sort_order: maxOrder + 1 }
        : { cohort_id: cohortId, name: trimmed, sort_order: maxOrder + 1, is_published: false })
        .select('id').single()
      : await supabase.from(table).update({ name: trimmed }).eq('id', groupId).select('id').single()
    setBusy(false)
    if (result.error) { toast('강좌 그룹을 저장하지 못했습니다.', 'error'); return }
    toast(dialog === 'create' ? '새 강좌 그룹이 추가되었습니다.' : '강좌 그룹명이 변경되었습니다.')
    setDialog(null)
    onChanged(result.data?.id || groupId)
  }

  async function togglePublished() {
    if (!current) return
    const next = !current.is_published
    const { error } = await supabase.from('cohort_course_groups').update({ is_published: next }).eq('id', current.id)
    if (error) { toast('공개 설정을 변경하지 못했습니다.', 'error'); return }
    toast(next ? '학생에게 강좌 그룹을 공개했습니다.' : '학생 화면에서 강좌 그룹을 숨겼습니다.')
    onChanged(current.id)
  }

  return (
    <>
      <div className="course-group-bar">
        <div className="course-group-picker">
          <IconFolder size={18} stroke={1.75} />
          <label htmlFor={`${scope}-course-group`}>강좌 그룹</label>
          <select id={`${scope}-course-group`} className="select-sm" value={groupId} onChange={(event) => onSelect(event.target.value)}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {scope === 'cohort' && current && (
            <button className={`btn btn-sm ${current.is_published ? 'btn-white' : 'btn-primary'}`} onClick={togglePublished}>
              {current.is_published ? <IconEye size={14} stroke={1.75} /> : <IconEyeOff size={14} stroke={1.75} />}
              {current.is_published ? '학생 공개 중' : '학생에게 공개'}
            </button>
          )}
          <button className="btn btn-white btn-sm" onClick={openRename} disabled={!current}><IconPencil size={14} stroke={1.75} /> 그룹명 변경</button>
          <button className="btn btn-white btn-sm" onClick={openCreate}><IconPlus size={14} stroke={1.75} /> 그룹 추가</button>
        </div>
      </div>
      <Dialog open={!!dialog} title={dialog === 'create' ? '새 강좌 그룹' : '강좌 그룹명 변경'} onClose={() => setDialog(null)}
        actions={<>
          <button className="btn btn-white btn-sm" onClick={() => setDialog(null)} disabled={busy}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={saveGroup} disabled={busy || !name.trim()}>{busy ? '저장 중…' : '저장'}</button>
        </>}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>그룹명</label>
          <input className="input" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') saveGroup() }} placeholder="예: 심화 과정" />
        </div>
      </Dialog>
    </>
  )
}

function MoveCourseDialog({ scope, course, groups, currentGroupId, onClose, onDone }) {
  const toast = useToast()
  const [targetGroupId, setTargetGroupId] = useState('')
  const [copy, setCopy] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!course) return
    setTargetGroupId(groups.find((group) => group.id !== currentGroupId)?.id || '')
    setCopy(false)
  }, [course, groups, currentGroupId])

  async function run() {
    if (!targetGroupId) return
    setBusy(true)
    const rpc = scope === 'master' ? 'admin_transfer_master_course' : 'admin_transfer_cohort_course'
    const { error } = await supabase.rpc(rpc, {
      p_course_id: course.id, p_target_group_id: targetGroupId, p_copy: copy,
    })
    setBusy(false)
    if (error) { toast(`강좌 ${copy ? '복사' : '이동'}에 실패했습니다.`, 'error'); return }
    toast(`강좌를 ${copy ? '복사' : '이동'}했습니다.`)
    onDone()
  }

  const targets = groups.filter((group) => group.id !== currentGroupId)
  return (
    <Dialog open={!!course} title={`강좌 이동·복사 — ${course?.title || ''}`} onClose={onClose}
      actions={<>
        <button className="btn btn-white btn-sm" onClick={onClose} disabled={busy}>취소</button>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy || !targetGroupId}>
          {busy ? '처리 중…' : copy ? '복사' : '이동'}
        </button>
      </>}>
      {targets.length === 0 ? <EmptyState title="이동할 다른 강좌 그룹이 없습니다" description="먼저 새 강좌 그룹을 추가해 주세요." /> : <>
        <div className="field">
          <label>대상 그룹</label>
          <select className="select" value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>
            {targets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>작업 방식</label>
          <div className="transfer-options">
            <label className={`choice-row ${!copy ? 'selected' : ''}`}>
              <input type="radio" checked={!copy} onChange={() => setCopy(false)} />
              <span><strong><IconArrowsMove size={15} /> 이동</strong><br /><span className="t-caption muted-soft">현재 그룹에서 빼고 대상 그룹으로 옮깁니다.</span></span>
            </label>
            <label className={`choice-row ${copy ? 'selected' : ''}`}>
              <input type="radio" checked={copy} onChange={() => setCopy(true)} />
              <span><strong><IconCopy size={15} /> 복사</strong><br /><span className="t-caption muted-soft">현재 강좌는 유지하고 구성 전체를 복제합니다.</span></span>
            </label>
          </div>
        </div>
      </>}
    </Dialog>
  )
}

/* ============ 강좌 읽기 화면 (마스터/기수 공용) — 학생 화면과 유사한 읽기 전용 뷰 ============ */
function CourseAdminView({ isMaster, course, onBack, onEdit }) {
  const toast = useToast()
  const attachments = (isMaster ? course.master_attachments : course.cohort_attachments) || []

  async function handleDownload(att) {
    try {
      await downloadFile('course-files', att.file_path, att.filename)
    } catch {
      toast('다운로드에 실패했습니다.', 'error')
    }
  }

  const actionButtons = (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn btn-white btn-sm" onClick={onBack}>목록으로</button>
      <button className="btn btn-primary btn-sm" onClick={onEdit}><IconPencil size={14} stroke={1.75} /> 수정</button>
    </div>
  )

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 860 }}>
      <div className="row-between">
        <div className="row" style={{ gap: 12 }}>
          {isMaster
            ? <span className="badge-role-soft">마스터</span>
            : <span className="badge-course-no" style={{ fontSize: 13, padding: '6px 10px' }}>{pad2(course.course_no)}</span>}
          <h2 className="t-h2">{course.title}</h2>
        </div>
        {actionButtons}
      </div>
      {course.summary && <p className="t-muted-sm">{course.summary}</p>}

      <section className="card-panel">
        <RichBody html={course.body || '<p class="muted">본문이 없습니다.</p>'} />
      </section>

      {!isMaster && course.external_url && (
        <section className="card-panel">
          <h3 className="t-h3 mb-8">외부 링크</h3>
          <a href={course.external_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
            <IconExternalLink size={16} stroke={1.75} /> {course.external_url}
          </a>
        </section>
      )}

      {attachments.length > 0 && (
        <section className="card-panel">
          <h3 className="t-h3 mb-16">첨부파일</h3>
          {attachments.map((a) => (
            <div key={a.id} className="attachment-row">
              <IconFile size={18} stroke={1.75} color="var(--muted)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
              <span className="size">{fmtBytes(a.file_size)}</span>
              <button className="icon-btn" onClick={() => handleDownload(a)} aria-label={`${a.filename} 다운로드`}>
                <IconDownload size={16} stroke={1.75} />
              </button>
            </div>
          ))}
        </section>
      )}

      {course.assignment_enabled && (
        <section className="card-panel">
          <div className="row mb-8" style={{ gap: 8 }}>
            <h3 className="t-h3">과제</h3>
            <StatusPill kind="neutral">사용 중</StatusPill>
          </div>
          {course.assignment_text && <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{course.assignment_text}</p>}
          {course.assignment_due && (
            <span className="t-muted-sm tnum">마감일 {fmtDate(course.assignment_due, true)}</span>
          )}
        </section>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>{actionButtons}</div>
    </div>
  )
}

/* ============ 강좌 편집기 (마스터/기수 공용) ============ */
function CourseEditor({ isMaster, cohortId, groupId, nextNo, course, onDone }) {
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
  const draft = useDraft(`course:${isMaster ? 'master' : cohortId}:${course?.id || 'new'}`, form, setForm,
    (d) => !course && !d.title && !d.summary && !d.body && !d.assignment_text)
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
          const { data, error } = await supabase.from('master_courses')
            .insert({ ...base, group_id: groupId, sort_order: Number(nextNo) || 1 }).select('id').single()
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
          const { data, error } = await supabase.from('cohort_courses')
            .insert({ ...extended, cohort_id: cohortId, group_id: groupId }).select('id').single()
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
      draft.clear()
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
        <h2 className="t-h2 row" style={{ gap: 10 }}>{course ? '강좌 수정' : isMaster ? '새 마스터 강좌' : '새 강좌'} <DraftBadge savedAt={draft.savedAt} restored={draft.restored} /></h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={() => { draft.clear(); onDone() }}>목록으로</button>
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

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-white btn-sm" onClick={() => { draft.clear(); onDone() }}>목록으로</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  )
}
