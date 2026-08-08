import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FooterBar } from '../../shared/ui'

export default function Reset() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // 메일 링크로 진입한 경우 (type=recovery)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
    })
    if (window.location.href.includes('type=recovery')) setRecoveryMode(true)
    return () => sub.subscription.unsubscribe()
  }, [])

  async function sendReset(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const redirect = `${window.location.origin}/#/reset`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirect,
    })
    setBusy(false)
    if (err) setError('메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    else setSent(true)
  }

  async function updatePassword(e) {
    e.preventDefault()
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setError('비밀번호는 8자 이상, 영문+숫자 조합이어야 합니다.')
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password: newPw })
    setBusy(false)
    if (err) setError('비밀번호 변경에 실패했습니다.')
    else setDone(true)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="t-h2 mb-16">비밀번호 재설정</div>
        {error && <div className="auth-banner error">{error}</div>}
        {recoveryMode ? (
          done ? (
            <>
              <div className="auth-banner ok">비밀번호가 변경되었습니다.</div>
              <Link to="/login" className="btn btn-primary btn-block">로그인으로 이동</Link>
            </>
          ) : (
            <form onSubmit={updatePassword}>
              <div className="field">
                <label>새 비밀번호</label>
                <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <span className="hint">8자 이상, 영문+숫자 조합</span>
              </div>
              <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '변경 중…' : '비밀번호 변경'}</button>
            </form>
          )
        ) : sent ? (
          <>
            <div className="auth-banner ok">재설정 메일을 발송했습니다. 메일함을 확인해 주세요.</div>
            <Link to="/login" className="btn btn-white btn-block">로그인으로 돌아가기</Link>
          </>
        ) : (
          <form onSubmit={sendReset}>
            <div className="field">
              <label>가입한 메일주소</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '발송 중…' : '재설정 메일 발송'}</button>
            <div className="row mt-16" style={{ justifyContent: 'center' }}>
              <Link to="/login" className="btn-text btn">로그인으로 돌아가기</Link>
            </div>
          </form>
        )}
      </div>
      <div style={{ width: '100%', marginTop: 32 }}><FooterBar /></div>
    </div>
  )
}
