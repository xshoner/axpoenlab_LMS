import { useEffect, useState } from 'react'
import { IconPlus, IconRefresh, IconTrash, IconArrowUp, IconArrowDown, IconBooks } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, Dialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, pad2, COHORT_STATUS } from '../../lib/helpers'

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = 'AX-'
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export default function Cohorts() {
  const { cohorts, reload } = useCohort()
  const toast = useToast()
  const [editTarget, setEditTarget] = useState(null) // null | {} | cohort
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [snapshotTarget, setSnapshotTarget] = useState(null)
  const [coursesTarget, setCoursesTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function saveCohort(form) {
    setBusy(true)
    try {
      if (form.id) {
        const { error } = await supabase.from('cohorts').update({
          name: form.name, start_date: form.start_date || null, end_date: form.end_date || null, status: form.status,
        }).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cohorts').insert({
          name: form.name, code: form.code, start_date: form.start_date || null, end_date: form.end_date || null, status: form.status,
        })
        if (error) throw error
      }
      toast('저장되었습니다.')
      setEditTarget(null)
      reload()
    } catch {
      toast('저장에 실패했습니다. 기수 코드 중복 여부를 확인해 주세요.', 'error')
    } finally { setBusy(false) }
  }

  async function regenCode(c) {
    const code = genCode()
    const { error } = await supabase.from('cohorts').update({ code }).eq('id', c.id)
    if (error) toast('코드 재발급 실패', 'error')
    else { toast(`새 기수 코드: ${code}`); reload() }
  }

  async function softDelete() {
    setBusy(true)
    const { error } = await supabase.from('cohorts').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id)
    setBusy(false)
    if (error) toast('삭제 실패', 'error')
    else { toast('기수가 삭제되었습니다. (90일 보관 후 영구 삭제)'); setDeleteTarget(null); reload() }
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between">
        <h2 className="t-h2">기수 관리</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditTarget({ name: '', code: genCode(), start_date: '', end_date: '', status: 'preparing' })}>
          <IconPlus size={14} stroke={1.75} /> 새 기수 개설
        </button>
      </div>

      {cohorts.length === 0 ? (
        <EmptyState title="아직 개설된 기수가 없습니다" description="새 기수를 개설하고 마스터 강좌를 배정해 보세요."
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditTarget({ name: '', code: genCode(), start_date: '', end_date: '', status: 'preparing' })}>새 기수 개설</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>기수명</th><th>기간</th><th>기수 코드</th><th>상태</th><th style={{ width: 340 }}>작업</th></tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id}>
                  <td className="t-emph">{c.name}</td>
                  <td className="tnum">{fmtDate(c.start_date)} ~ {fmtDate(c.end_date)}</td>
                  <td className="tnum"><code style={{ background: 'var(--surface)', padding: '2px 8px', borderRadius: 6 }}>{c.code}</code></td>
                  <td><StatusPill kind={c.status === 'active' ? 'open' : c.status === 'closed' ? 'closed' : 'neutral'}>{COHORT_STATUS[c.status]}</StatusPill></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-white btn-sm" onClick={() => setEditTarget(c)}>수정</button>
                      <button className="btn btn-white btn-sm" onClick={() => setSnapshotTarget(c)}><IconBooks size={14} stroke={1.75} /> 강좌 배정</button>
                      <button className="btn btn-white btn-sm" onClick={() => setCoursesTarget(c)}>강좌 순서</button>
                      <button className="btn btn-white btn-sm" onClick={() => regenCode(c)} title="기수 코드 재발급"><IconRefresh size={14} stroke={1.75} /></button>
                      <button className="icon-btn danger" onClick={() => setDeleteTarget(c)} title="삭제"><IconTrash size={16} stroke={1.75} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && <CohortDialog cohort={editTarget} busy={busy} onSave={saveCohort} onClose={() => setEditTarget(null)} />}
      {snapshotTarget && <SnapshotDialog cohort={snapshotTarget} onClose={() => { setSnapshotTarget(null) }} />}
      {coursesTarget && <ReorderDialog cohort={coursesTarget} onClose={() => setCoursesTarget(null)} />}
      <ConfirmDialog
        open={!!deleteTarget} danger busy={busy}
        title="기수 삭제"
        message={`'${deleteTarget?.name}' 기수를 삭제합니다. 소프트 삭제되어 90일간 보관 후 영구 삭제됩니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        onConfirm={softDelete} onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function CohortDialog({ cohort, busy, onSave, onClose }) {
  const [form, setForm] = useState({ ...cohort })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Dialog open title={form.id ? '기수 수정' : '새 기수 개설'} onClose={onClose}
      actions={
        <>
          <button className="btn btn-white btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !form.name.trim()} onClick={() => onSave(form)}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }>
      <div className="field">
        <label>기수명 <span className="req">*</span></label>
        <input className="input" value={form.name} onChange={set('name')} placeholder="예: AX오픈랩 3기" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>시작일</label>
          <input className="input" type="date" value={form.start_date || ''} onChange={set('start_date')} />
        </div>
        <div className="field">
          <label>종료일</label>
          <input className="input" type="date" value={form.end_date || ''} onChange={set('end_date')} />
        </div>
      </div>
      {!form.id && (
        <div className="field">
          <label>기수 코드 (자동 생성)</label>
          <input className="input" value={form.code} readOnly style={{ background: 'var(--surface)' }} />
        </div>
      )}
      <div className="field">
        <label>상태</label>
        <select className="select" value={form.status} onChange={set('status')}>
          <option value="preparing">준비중</option>
          <option value="active">진행중</option>
          <option value="closed">종료</option>
        </select>
      </div>
    </Dialog>
  )
}

function SnapshotDialog({ cohort, onClose }) {
  const toast = useToast()
  const [masters, setMasters] = useState(null)
  const [checked, setChecked] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('master_courses').select('id, title, summary').order('sort_order')
      .then(({ data }) => setMasters(data || []))
  }, [])

  async function run() {
    setBusy(true)
    const { data, error } = await supabase.rpc('snapshot_courses_to_cohort', {
      p_cohort_id: cohort.id, p_master_ids: checked,
    })
    setBusy(false)
    if (error) toast('강좌 배정에 실패했습니다.', 'error')
    else { toast(`${data}개 강좌가 스냅샷으로 복제되었습니다.`); onClose() }
  }

  return (
    <Dialog open title={`${cohort.name} — 강좌 배정 (스냅샷 복제)`} onClose={onClose}
      actions={
        <>
          <button className="btn btn-white btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" disabled={busy || checked.length === 0} onClick={run}>
            {busy ? '복제 중…' : `${checked.length}개 강좌 배정`}
          </button>
        </>
      }>
      <p className="t-muted-sm mb-16">선택한 마스터 강좌가 본문·첨부·설문·퀴즈 구성과 함께 이 기수 전용 복사본으로 생성됩니다. 이후 수정해도 다른 기수와 마스터에 영향을 주지 않습니다.</p>
      {!masters ? <Loading /> : masters.length === 0 ? (
        <div className="t-muted-sm">마스터 강좌가 없습니다. 강좌 관리에서 먼저 만들어 주세요.</div>
      ) : (
        <div className="stack" style={{ gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {masters.map((m) => (
            <label key={m.id} className={`choice-row ${checked.includes(m.id) ? 'selected' : ''}`}>
              <input type="checkbox" checked={checked.includes(m.id)}
                onChange={() => setChecked((c) => c.includes(m.id) ? c.filter((x) => x !== m.id) : [...c, m.id])} />
              <span>{m.title}<br /><span className="t-caption muted-soft">{m.summary}</span></span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  )
}

function ReorderDialog({ cohort, onClose }) {
  const toast = useToast()
  const [courses, setCourses] = useState(null)

  async function load() {
    const { data } = await supabase.from('cohort_courses').select('id, course_no, title')
      .eq('cohort_id', cohort.id).order('course_no')
    setCourses(data || [])
  }
  useEffect(() => { load() }, [cohort.id])

  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= courses.length) return
    const a = courses[i], b = courses[j]
    await Promise.all([
      supabase.from('cohort_courses').update({ course_no: b.course_no }).eq('id', a.id),
      supabase.from('cohort_courses').update({ course_no: a.course_no }).eq('id', b.id),
    ])
    load()
  }

  return (
    <Dialog open title={`${cohort.name} — 강좌 순서`} onClose={onClose}
      actions={<button className="btn btn-primary btn-sm" onClick={onClose}>완료</button>}>
      {!courses ? <Loading /> : courses.length === 0 ? (
        <div className="t-muted-sm">이 기수에 배정된 강좌가 없습니다.</div>
      ) : (
        <div className="stack" style={{ gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {courses.map((c, i) => (
            <div key={c.id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
              <span className="badge-course-no">{pad2(c.course_no)}</span>
              <span style={{ flex: 1 }}>{c.title}</span>
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}><IconArrowUp size={16} stroke={1.75} /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === courses.length - 1}><IconArrowDown size={16} stroke={1.75} /></button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
