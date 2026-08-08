import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, setKeepSignedIn } from '../../lib/supabase'
import { FooterBar } from '../../shared/ui'

const LOCK_KEY = 'ax-login-lock'
const FAIL_KEY = 'ax-login-fails'
const MAX_FAILS = 5
const LOCK_MINUTES = 10

function getLockRemaining() {
  const until = Number(localStorage.getItem(LOCK_KEY) || 0)
  return Math.max(0, until - Date.now())
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockLeft, setLockLeft] = useState(getLockRemaining())

  useEffect(() => {
    if (lockLeft <= 0) return
    const t = setInterval(() => {
      const left = getLockRemaining()
      setLockLeft(left)
      if (left <= 0) {
        localStorage.removeItem(FAIL_KEY)
        localStorage.removeItem(LOCK_KEY)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [lockLeft > 0])

  async function onSubmit(e) {
    e.preventDefault()
    if (getLockRemaining() > 0) return
    setBusy(true)
    setError('')
    setKeepSignedIn(keep)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setBusy(false)
    if (err) {
      const fails = Number(localStorage.getItem(FAIL_KEY) || 0) + 1
      localStorage.setItem(FAIL_KEY, String(fails))
      if (fails >= MAX_FAILS) {
        localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_MINUTES * 60_000))
        setLockLeft(getLockRemaining())
      }
      setError('메일주소 또는 비밀번호가 올바르지 않습니다.')
      return
    }
    localStorage.removeItem(FAIL_KEY)
    localStorage.removeItem(LOCK_KEY)
    // 로그인 성공 → AuthProvider가 세션을 갱신하고 역할에 따라 라우팅
  }

  const locked = lockLeft > 0
  const mm = String(Math.floor(lockLeft / 60000)).padStart(2, '0')
  const ss = String(Math.floor((lockLeft % 60000) / 1000)).padStart(2, '0')

  return (
    <div className="auth-wrap">
      <div className="auth-split">
        <div className="auth-brand">
          <span className="kicker-gradient">기수 기반 AI 교육 운영</span>
          <h1 className="t-hero">
            모두의 AI,<br />
            <span className="gold-underline">더 나은 내일</span>을<br />
            공부해봅시다.
          </h1>
          <p className="t-body muted">
            강좌 열람부터 과제 제출, 설문·퀴즈까지 —<br />
            기수 기반 AI 교육 운영을 하나의 화면에서.
          </p>
        </div>
        <div className="auth-panel">
          <div className="row mb-16" style={{ gap: 10 }}>
            <span className="sidebar-logo">AX</span>
            <div>
              <div className="t-h2">AX오픈랩 LMS</div>
              <div className="t-caption muted-soft">로그인</div>
            </div>
          </div>
          {locked ? (
            <div className="auth-banner warn tnum">
              로그인이 잠시 제한되었습니다. {mm}:{ss} 후 다시 시도해 주세요.
            </div>
          ) : error ? (
            <div className="auth-banner error">{error}</div>
          ) : null}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">메일주소</label>
              <input id="email" className="input" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <input id="password" className="input" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={locked} />
            </div>
            <div className="checkbox-row mb-16">
              <input id="keep" type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <label htmlFor="keep">로그인 상태 유지 (30일)</label>
            </div>
            <button className="btn btn-primary sheen btn-block" type="submit" disabled={busy || locked}>
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </form>
          <div className="row-between mt-16">
            <Link to="/signup" className="btn-text btn">회원가입</Link>
            <Link to="/reset" className="btn-text btn">비밀번호를 잊으셨나요?</Link>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', marginTop: 32 }}><FooterBar /></div>
    </div>
  )
}
