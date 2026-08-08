import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useToast } from '../../shared/ui'

export default function Profile() {
  const { profile, cohort, refresh } = useAuth()
  const toast = useToast()
  const [org, setOrg] = useState(profile.org)
  const [name, setName] = useState(profile.name)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)

  async function saveInfo(e) {
    e.preventDefault()
    if (!name.trim()) { toast('성명을 입력해 주세요.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ org: org.trim(), name: name.trim() }).eq('id', profile.id)
    setBusy(false)
    if (error) toast('저장에 실패했습니다.', 'error')
    else { toast('저장되었습니다.'); refresh() }
  }

  async function changePassword(e) {
    e.preventDefault()
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) {
      toast('새 비밀번호는 8자 이상, 영문+숫자 조합이어야 합니다.', 'error')
      return
    }
    if (pw.next !== pw.confirm) { toast('새 비밀번호가 일치하지 않습니다.', 'error'); return }
    setPwBusy(true)
    // 현재 비밀번호 확인
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: pw.current })
    if (verifyErr) {
      setPwBusy(false)
      toast('현재 비밀번호가 올바르지 않습니다.', 'error')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: pw.next })
    setPwBusy(false)
    if (error) toast('비밀번호 변경에 실패했습니다.', 'error')
    else { toast('비밀번호가 변경되었습니다.'); setPw({ current: '', next: '', confirm: '' }) }
  }

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 560 }}>
      <section className="card-panel">
        <h2 className="t-h2 mb-16">내 정보</h2>
        <form onSubmit={saveInfo}>
          <div className="field">
            <label>메일주소</label>
            <input className="input" value={profile.email} disabled style={{ background: 'var(--surface)' }} />
            <span className="hint">메일주소 변경은 관리자에게 문의해 주세요.</span>
          </div>
          <div className="field">
            <label>소속 기수</label>
            <input className="input" value={cohort?.name || '미배정'} disabled style={{ background: 'var(--surface)' }} />
          </div>
          <div className="field">
            <label>소속 (조직/회사명)</label>
            <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} />
          </div>
          <div className="field">
            <label>성명</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </form>
      </section>
      <section className="card-panel">
        <h2 className="t-h2 mb-16">비밀번호 변경</h2>
        <form onSubmit={changePassword}>
          <div className="field">
            <label>현재 비밀번호</label>
            <input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div className="field">
            <label>새 비밀번호</label>
            <input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <span className="hint">8자 이상, 영문+숫자 조합</span>
          </div>
          <div className="field">
            <label>새 비밀번호 확인</label>
            <input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? '변경 중…' : '비밀번호 변경'}</button>
        </form>
      </section>
    </div>
  )
}
