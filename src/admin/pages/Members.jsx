import { useEffect, useState } from 'react'
import { IconFileSpreadsheet, IconSearch } from '@tabler/icons-react'
import { AUTH_REDIRECT_URL, supabase, FUNCTIONS_URL } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, Dialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, downloadCsv, asOne } from '../../lib/helpers'

export default function Members() {
  const { cohorts, selectedId } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [assignTarget, setAssignTarget] = useState(null)
  const [assignCohort, setAssignCohort] = useState('')
  const [confirmMove, setConfirmMove] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: profiles } = await supabase.from('profiles')
      .select('*, cohort_members(cohort_id, cohorts(id, name))')
      .eq('role', 'student').order('created_at', { ascending: false })
    setRows(profiles || [])
  }
  useEffect(() => { load() }, [])

  if (!rows) return <Loading />

  const filtered = rows.filter((r) => {
    if (selectedId && asOne(r.cohort_members)?.cohort_id !== selectedId) return false
    if (search && !`${r.name}${r.email}${r.org}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function doAssign() {
    const target = confirmMove
    setBusy(true)
    const { error } = await supabase.rpc('assign_member', {
      p_user_id: target.user.id, p_cohort_id: target.cohortId || null,
    })
    setBusy(false)
    if (error) { toast('배정 변경 실패', 'error'); return }
    toast('기수 배정이 변경되었습니다.')
    setConfirmMove(null)
    setAssignTarget(null)
    load()
  }

  function requestAssign() {
    const current = asOne(assignTarget.cohort_members)
    const currentName = current?.cohorts?.name
    const nextName = cohorts.find((c) => c.id === assignCohort)?.name || '미배정'
    if (current && assignCohort && current.cohort_id !== assignCohort) {
      setConfirmMove({
        user: assignTarget, cohortId: assignCohort,
        message: `${assignTarget.name} 학생은 현재 ${currentName} 소속입니다. ${nextName}(으)로 이동하면 ${currentName} 소속이 해제됩니다.`,
      })
    } else {
      setConfirmMove({ user: assignTarget, cohortId: assignCohort, message: `${assignTarget.name} 학생을 ${nextName}(으)로 배정합니다.` })
    }
  }

  async function toggleActive(user) {
    const next = user.status === 'active' ? 'inactive' : 'active'
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FUNCTIONS_URL}/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'set_status', user_id: user.id, status: next }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error)
      toast(next === 'active' ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.')
      load()
    } catch {
      toast('상태 변경 실패', 'error')
    } finally { setBusy(false) }
  }

  async function resetPassword() {
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetTarget.email, {
        redirectTo: AUTH_REDIRECT_URL,
      })
      if (error) throw error
      toast(`${resetTarget.name} 님에게 재설정 메일을 발송했습니다.`)
      setResetTarget(null)
    } catch {
      toast('비밀번호 초기화 실패', 'error')
    } finally { setBusy(false) }
  }

  function exportCsv() {
    const header = ['소속', '성명', '메일', '기수', '가입일', '최근 접속일', '상태']
    const data = filtered.map((r) => [
      r.org, r.name, r.email, asOne(r.cohort_members)?.cohorts?.name || '미배정',
      fmtDate(r.created_at), fmtDate(r.last_login_at, true), r.status === 'active' ? '활성' : '비활성',
    ])
    downloadCsv('회원목록.csv', [header, ...data])
  }

  return (
    <div className="stack members-page" style={{ gap: 16 }}>
      <div className="row-between members-toolbar">
        <h2 className="t-h2">회원 관리 <span className="t-muted-sm tnum">({filtered.length}명)</span></h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="row" style={{ position: 'relative' }}>
            <IconSearch size={16} stroke={1.75} style={{ position: 'absolute', left: 12, color: 'var(--muted-soft)' }} />
            <input className="input" style={{ height: 40, paddingLeft: 36, width: 240 }} placeholder="이름·메일·소속 검색"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-white btn-sm" onClick={exportCsv}><IconFileSpreadsheet size={14} stroke={1.75} /> CSV</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="조건에 맞는 회원이 없습니다" />
      ) : (
        <div className="table-wrap members-table-wrap">
          <table className="data-table members-table">
            <thead>
              <tr><th>성명</th><th>소속</th><th>메일</th><th>기수</th><th>가입일</th><th>최근 접속</th><th>상태</th><th style={{ width: 280 }}>작업</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="t-emph">{r.name}</td>
                  <td className="t-muted-sm">{r.org}</td>
                  <td className="t-muted-sm">{r.email}</td>
                  <td>{asOne(r.cohort_members)?.cohorts?.name
                    ? <StatusPill kind="neutral">{asOne(r.cohort_members).cohorts.name}</StatusPill>
                    : <StatusPill kind="open">미배정</StatusPill>}</td>
                  <td className="tnum">{fmtDate(r.created_at)}</td>
                  <td className="tnum">{fmtDate(r.last_login_at)}</td>
                  <td>{r.status === 'active'
                    ? <StatusPill kind="done">활성</StatusPill>
                    : <StatusPill kind="closed">비활성</StatusPill>}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-white btn-sm" onClick={() => { setAssignTarget(r); setAssignCohort(asOne(r.cohort_members)?.cohort_id || '') }}>기수 배정</button>
                      <button className="btn btn-white btn-sm" disabled={busy} onClick={() => toggleActive(r)}>{r.status === 'active' ? '비활성화' : '활성화'}</button>
                      <button className="btn btn-white btn-sm" disabled={busy} onClick={() => setResetTarget(r)}>재설정 메일</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!assignTarget} title={`기수 배정 — ${assignTarget?.name}`} onClose={() => setAssignTarget(null)}
        actions={
          <>
            <button className="btn btn-white btn-sm" onClick={() => setAssignTarget(null)}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={requestAssign}>배정 변경</button>
          </>
        }>
        <p className="t-muted-sm mb-16">학습자는 동시에 1개 기수에만 소속됩니다 (1인 1기수).</p>
        <select className="select" value={assignCohort} onChange={(e) => setAssignCohort(e.target.value)}>
          <option value="">미배정</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Dialog>

      <ConfirmDialog open={!!confirmMove} busy={busy} title="기수 이동 확인"
        message={confirmMove?.message} confirmLabel="이동"
        onConfirm={doAssign} onClose={() => setConfirmMove(null)} />

      <ConfirmDialog open={!!resetTarget} busy={busy} title="비밀번호 재설정 메일 발송"
        message={`${resetTarget?.name} 님의 가입 메일(${resetTarget?.email})로 안전한 비밀번호 재설정 링크를 보냅니다.`}
        confirmLabel="메일 발송" onConfirm={resetPassword} onClose={() => setResetTarget(null)} />
    </div>
  )
}
