import { useEffect, useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { supabase, FUNCTIONS_URL } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { ConfirmDialog, Dialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, ROLE_LABEL } from '../../lib/helpers'

export default function AdminAccounts() {
  const { profile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ email: '', name: '', org: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('profiles').select('*')
      .in('role', ['admin', 'super_admin']).order('created_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function callFn(body) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${FUNCTIONS_URL}/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  async function createAdmin() {
    if (!form.email.trim() || !form.name.trim()) { toast('메일과 성명을 입력해 주세요.', 'error'); return }
    if (form.password.length < 8) { toast('초기 비밀번호는 8자 이상이어야 합니다.', 'error'); return }
    setBusy(true)
    try {
      const json = await callFn({ action: 'create_admin', ...form })
      if (!json.ok) {
        toast(json.error === 'email_exists' ? '이미 가입된 메일주소입니다.' : '생성에 실패했습니다.', 'error')
        return
      }
      toast('관리자 계정이 생성되었습니다.')
      setCreateOpen(false)
      setForm({ email: '', name: '', org: '', password: '' })
      load()
    } finally { setBusy(false) }
  }

  async function deleteAdmin() {
    setBusy(true)
    try {
      const json = await callFn({ action: 'delete_user', user_id: deleteTarget.id })
      if (!json.ok) { toast('삭제에 실패했습니다.', 'error'); return }
      toast('관리자 계정이 삭제되었습니다.')
      setDeleteTarget(null)
      load()
    } finally { setBusy(false) }
  }

  async function toggleActive(user) {
    const next = user.status === 'active' ? 'inactive' : 'active'
    setBusy(true)
    try {
      const json = await callFn({ action: 'set_status', user_id: user.id, status: next })
      if (!json.ok) throw new Error(json.error)
      toast(next === 'active' ? '관리자 계정이 활성화되었습니다.' : '관리자 계정이 비활성화되었습니다.')
      load()
    } catch {
      toast('상태 변경 실패', 'error')
    } finally { setBusy(false) }
  }

  if (!rows) return <Loading />

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h2 className="t-h2">관리자 계정 관리</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} stroke={1.75} /> 관리자 생성
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>성명</th><th>메일</th><th>역할</th><th>상태</th><th>생성일</th><th style={{ width: 200 }}>작업</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="t-emph">{r.name}</td>
                <td className="t-muted-sm">{r.email}</td>
                <td>{r.role === 'super_admin' ? <span className="badge-role">슈퍼관리자</span> : <span className="badge-role-soft">관리자</span>}</td>
                <td>{r.status === 'active' ? <StatusPill kind="done">활성</StatusPill> : <StatusPill kind="closed">비활성</StatusPill>}</td>
                <td className="tnum">{fmtDate(r.created_at)}</td>
                <td>
                  {r.role !== 'super_admin' && (
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-white btn-sm" disabled={busy} onClick={() => toggleActive(r)}>{r.status === 'active' ? '비활성화' : '활성화'}</button>
                      <button className="icon-btn danger" onClick={() => setDeleteTarget(r)}><IconTrash size={16} stroke={1.75} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} title="관리자 계정 생성" onClose={() => setCreateOpen(false)}
        actions={
          <>
            <button className="btn btn-white btn-sm" onClick={() => setCreateOpen(false)}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={createAdmin} disabled={busy}>{busy ? '생성 중…' : '생성'}</button>
          </>
        }>
        <div className="field">
          <label>메일주소 <span className="req">*</span></label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>성명 <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>소속</label>
            <input className="input" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>초기 비밀번호 <span className="req">*</span></label>
          <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <span className="hint">8자 이상 · 전달 후 첫 로그인 시 변경을 안내해 주세요.</span>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="관리자 계정 삭제"
        message={`'${deleteTarget?.name} (${deleteTarget?.email})' 관리자 계정을 영구 삭제합니다. 계속하시겠습니까?`}
        confirmLabel="삭제" onConfirm={deleteAdmin} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
