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
  const [membersTarget, setMembersTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function toggleSignupForce(cohort) {
    setBusy(true)
    const enabled = !cohort.signup_forced
    const { error } = await supabase.rpc('set_forced_signup_cohort', {
      p_cohort_id: cohort.id,
      p_enabled: enabled,
    })
    setBusy(false)
    if (error) toast('기수 코드 강제 설정을 변경하지 못했습니다.', 'error')
    else {
      toast(enabled ? `${cohort.name} 코드가 모든 회원가입에 강제 적용됩니다.` : '기수 코드 강제가 해제되었습니다.')
      reload()
    }
  }

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
              <tr><th>기수명</th><th>기간</th><th>기수 코드</th><th>가입 코드</th><th>상태</th><th style={{ width: 340 }}>작업</th></tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button type="button" className="btn btn-text t-emph" onClick={() => setMembersTarget(c)}>
                      {c.name}
                    </button>
                  </td>
                  <td className="tnum">{fmtDate(c.start_date)} ~ {fmtDate(c.end_date)}</td>
                  <td className="tnum"><code style={{ background: 'var(--surface)', padding: '2px 8px', borderRadius: 6 }}>{c.code}</code></td>
                  <td>
                    <label className="checkbox-row" style={{ whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!!c.signup_forced} disabled={busy}
                        onChange={() => toggleSignupForce(c)} />
                      <span>{c.signup_forced ? '강제 적용 중' : '기수 코드 강제'}</span>
                    </label>
                  </td>
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
      {membersTarget && <CohortMembersDialog cohort={membersTarget} onClose={() => setMembersTarget(null)} />}
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

function CohortMembersDialog({ cohort, onClose }) {
  const [members, setMembers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error: queryError } = await supabase.from('cohort_members')
        .select('id, joined_at, profiles(id, name, email, org, status)')
        .eq('cohort_id', cohort.id)
        .order('joined_at', { ascending: true })
      if (!alive) return
      if (queryError) {
        setError('회원 정보를 불러오지 못했습니다.')
        setMembers([])
      } else {
        setMembers(data || [])
      }
    })()
    return () => { alive = false }
  }, [cohort.id])

  return (
    <Dialog open wide title={`${cohort.name} — 회원 정보`} onClose={onClose}
      actions={<button className="btn btn-primary btn-sm" onClick={onClose}>닫기</button>}>
      {!members ? <Loading label="회원 정보를 불러오는 중…" /> : error ? (
        <div className="t-muted-sm">{error}</div>
      ) : members.length === 0 ? (
        <EmptyState title="이 기수에 등록된 회원이 없습니다" />
      ) : (
        <>
          <div className="t-caption muted-soft mb-8">총 {members.length}명</div>
          <div className="table-wrap" style={{ maxHeight: '55vh' }}>
            <table className="data-table">
              <thead>
                <tr><th>이름</th><th>소속</th><th>이메일</th><th>상태</th><th>등록일</th></tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
                  return (
                    <tr key={member.id}>
                      <td className="t-emph">{profile?.name || '-'}</td>
                      <td>{profile?.org || '-'}</td>
                      <td>{profile?.email || '-'}</td>
                      <td><StatusPill kind={profile?.status === 'active' ? 'open' : 'neutral'}>{profile?.status === 'active' ? '활성' : '비활성'}</StatusPill></td>
                      <td className="tnum">{fmtDate(member.joined_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Dialog>
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
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [masters, setMasters] = useState(null)
  const [checked, setChecked] = useState([])
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.from('master_course_groups').select('id, name, sort_order, is_default').order('sort_order').order('created_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setGroups([]); toast('강좌 그룹을 불러오지 못했습니다.', 'error'); return }
        const next = data || []
        setGroups(next)
        setGroupId(next.find((group) => group.is_default)?.id || next[0]?.id || '')
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!groupId) { if (groups) setMasters([]); return }
    let alive = true
    setMasters(null)
    setChecked([])
    supabase.from('master_courses').select('id, title, summary, sort_order')
      .eq('group_id', groupId).order('sort_order').order('created_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setMasters([]); toast('강좌 모듈을 불러오지 못했습니다.', 'error'); return }
        setMasters(data || [])
      })
    return () => { alive = false }
  }, [groupId])

  async function run() {
    setBusy(true)
    const { data, error } = await supabase.rpc('snapshot_courses_to_cohort', {
      p_cohort_id: cohort.id, p_master_ids: checked, p_publish: publish,
    })
    setBusy(false)
    if (error) toast('강좌 배정에 실패했습니다.', 'error')
    else { toast(`${data}개 강좌가 스냅샷으로 복제되었습니다.`); onClose() }
  }

  return (
    <Dialog open extraWide title={`${cohort.name} — 강좌 배정`} onClose={onClose}
      actions={
        <>
          <button className="btn btn-white btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" disabled={busy || checked.length === 0} onClick={run}>
            {busy ? '복제 중…' : `${checked.length}개 강좌 배정`}
          </button>
        </>
      }>
      <p className="t-muted-sm mb-16">강좌 그룹을 고른 뒤 배정할 세부 모듈을 선택하세요. 본문·첨부·과제·설문·퀴즈가 기수 전용 복사본으로 생성됩니다.</p>
      {!groups ? <Loading /> : groups.length === 0 ? (
        <EmptyState title="강좌 그룹이 없습니다" description="강좌 관리에서 먼저 그룹과 강좌를 만들어 주세요." />
      ) : <>
        <div className="snapshot-toolbar">
          <div className="field snapshot-group-field">
            <label>1. 강좌 그룹 선택</label>
            <select className="select" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
          <label className={`snapshot-publish ${publish ? 'active' : ''}`}>
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
            <span><strong>학생에게 공개</strong><small>배정 즉시 ‘내 교육과정’에 표시</small></span>
          </label>
        </div>
        {!masters ? <Loading /> : masters.length === 0 ? (
          <EmptyState title="이 그룹에 강좌 모듈이 없습니다" description="다른 그룹을 선택하거나 강좌 관리에서 모듈을 추가해 주세요." />
        ) : (
        <>
          <div className="row-between snapshot-selection-head">
            <div>
              <div className="t-label">2. 세부 강좌 모듈 선택</div>
              <span className="t-caption muted-soft tnum">현재 그룹 {masters.length}개 중 {checked.length}개 선택</span>
            </div>
            <button className="btn btn-white btn-sm"
              onClick={() => setChecked(checked.length === masters.length ? [] : masters.map((m) => m.id))}>
              {checked.length === masters.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="snapshot-course-grid">
          {masters.map((m) => (
            <label key={m.id} className={`snapshot-course-choice ${checked.includes(m.id) ? 'selected' : ''}`}>
              <input type="checkbox" checked={checked.includes(m.id)}
                onChange={() => setChecked((c) => c.includes(m.id) ? c.filter((x) => x !== m.id) : [...c, m.id])} />
              <span><strong>{m.title}</strong><small>{m.summary || '요약 없음'}</small></span>
            </label>
          ))}
          </div>
        </>
        )}
      </>}
    </Dialog>
  )
}

function ReorderDialog({ cohort, onClose }) {
  const toast = useToast()
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [courses, setCourses] = useState(null)

  useEffect(() => {
    supabase.from('cohort_course_groups').select('id, name, sort_order, is_default')
      .eq('cohort_id', cohort.id).order('sort_order')
      .then(({ data }) => {
        const next = data || []
        setGroups(next)
        setGroupId(next.find((group) => group.is_default)?.id || next[0]?.id || '')
      })
  }, [cohort.id])

  async function load() {
    if (!groupId) { setCourses([]); return }
    const { data } = await supabase.from('cohort_courses').select('id, course_no, title')
      .eq('cohort_id', cohort.id).eq('group_id', groupId).order('course_no')
    setCourses(data || [])
  }
  useEffect(() => { if (groupId) load() }, [groupId])

  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= courses.length) return
    const next = [...courses]
    ;[next[i], next[j]] = [next[j], next[i]]
    const reordered = next.map((course, index) => ({ ...course, course_no: index + 1 }))
    setCourses(reordered)
    const { error } = await supabase.rpc('admin_reorder_cohort_courses', {
      p_group_id: groupId, p_ids: reordered.map((course) => course.id),
    })
    if (error) { toast('강좌 순서를 저장하지 못했습니다.', 'error'); load() }
  }

  return (
    <Dialog open title={`${cohort.name} — 강좌 순서`} onClose={onClose}
      actions={<button className="btn btn-primary btn-sm" onClick={onClose}>완료</button>}>
      {!groups || !courses ? <Loading /> : <>
        <div className="field">
          <label>강좌 그룹</label>
          <select className="select" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
      {courses.length === 0 ? (
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
      )}</>}
    </Dialog>
  )
}
