import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconCheck, IconX } from '@tabler/icons-react'
import { supabase, setKeepSignedIn, FUNCTIONS_URL, ANON_KEY } from '../../lib/supabase'
import { FooterBar } from '../../shared/ui'
import { PRIVACY_NOTICE_TEXT, PrivacyPolicyContent } from '../../shared/privacy'

export default function Signup() {
  const nav = useNavigate()
  const [form, setForm] = useState({ org: '', name: '', email: '', password: '', password2: '', cohortCode: '' })
  const [agree, setAgree] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [errors, setErrors] = useState({})
  const [emailDup, setEmailDup] = useState(null) // null | 'checking' | true | false
  const [busy, setBusy] = useState(false)
  const [topError, setTopError] = useState('')
  const [forcedCohort, setForcedCohort] = useState(null)
  const dupTimer = useRef(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    let alive = true
    async function loadForcedCohort() {
      const { data, error } = await supabase.rpc('get_forced_signup_cohort')
      if (!alive || error) return
      const forced = Array.isArray(data) ? data[0] : data
      setForcedCohort(forced || null)
      if (forced?.code) setForm((f) => ({ ...f, cohortCode: forced.code }))
      else setForm((f) => ({ ...f, cohortCode: '' }))
    }
    loadForcedCohort()
    const timer = window.setInterval(loadForcedCohort, 2000)
    window.addEventListener('focus', loadForcedCohort)
    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', loadForcedCohort)
    }
  }, [])

  // 실시간 이메일 중복 검사
  useEffect(() => {
    const email = form.email.trim().toLowerCase()
    setEmailDup(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    clearTimeout(dupTimer.current)
    setEmailDup('checking')
    dupTimer.current = setTimeout(async () => {
      // profiles는 비로그인 조회 불가 → 가입 시도시 서버가 최종 검증. 형식 검사만 통과 표시.
      setEmailDup(false)
    }, 400)
    return () => clearTimeout(dupTimer.current)
  }, [form.email])

  function validate() {
    const e = {}
    if (!form.org.trim()) e.org = '소속을 입력해 주세요.'
    if (!form.name.trim()) e.name = '성명을 입력해 주세요.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = '올바른 메일주소를 입력해 주세요.'
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      e.password = '비밀번호는 8자 이상, 영문+숫자 조합이어야 합니다.'
    if (form.password2 !== form.password) e.password2 = '비밀번호가 일치하지 않습니다.'
    if (!agree) e.agree = '개인정보 수집·이용 동의가 필요합니다.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function onSubmit(ev) {
    ev.preventDefault()
    setTopError('')
    if (!validate()) return
    setBusy(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          name: form.name.trim(),
          org: form.org.trim(),
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        if (json.error === 'email_exists') setErrors((e) => ({ ...e, email: '이미 가입된 메일주소입니다.' }))
        else setTopError('가입에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        setBusy(false)
        return
      }
      // 즉시 활성화 → 자동 로그인
      setKeepSignedIn(true)
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      })
      if (loginErr) {
        nav('/login')
        return
      }
      // 기수 코드 배정
      if (form.cohortCode.trim()) {
        await supabase.rpc('join_cohort_by_code', { p_code: form.cohortCode.trim() })
      }
      window.location.hash = '#/'
    } catch {
      setTopError('가입에 실패했습니다. 네트워크를 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-panel" style={{ maxWidth: 560 }}>
        <div className="row mb-16" style={{ gap: 10 }}>
          <span className="sidebar-logo">AX</span>
          <div>
            <div className="t-h2">회원가입</div>
            <div className="t-caption muted-soft">가입 완료 즉시 이용할 수 있습니다.</div>
          </div>
        </div>
        {topError && <div className="auth-banner error">{topError}</div>}
        <form onSubmit={onSubmit}>
          <div className="grid-2">
            <div className="field">
              <label>소속 (조직/회사명) <span className="req">*</span></label>
              <input className={`input ${errors.org ? 'error' : ''}`} value={form.org} onChange={set('org')} />
              {errors.org && <span className="err-msg">{errors.org}</span>}
            </div>
            <div className="field">
              <label>성명 <span className="req">*</span></label>
              <input className={`input ${errors.name ? 'error' : ''}`} value={form.name} onChange={set('name')} />
              {errors.name && <span className="err-msg">{errors.name}</span>}
            </div>
          </div>
          <div className="field" style={{ position: 'relative' }}>
            <label>메일주소 <span className="req">*</span></label>
            <input className={`input ${errors.email ? 'error' : ''}`} type="email" value={form.email} onChange={set('email')} />
            {emailDup === false && !errors.email && (
              <IconCheck size={16} color="var(--success)" stroke={1.75} style={{ position: 'absolute', right: 14, top: 42 }} />
            )}
            {errors.email && <span className="err-msg"><IconX size={12} stroke={1.75} />{errors.email}</span>}
          </div>
          <div className="grid-2">
            <div className="field">
              <label>비밀번호 <span className="req">*</span></label>
              <input className={`input ${errors.password ? 'error' : ''}`} type="password" value={form.password} onChange={set('password')} />
              {errors.password ? <span className="err-msg">{errors.password}</span> : <span className="hint">8자 이상, 영문+숫자 조합</span>}
            </div>
            <div className="field">
              <label>비밀번호 확인 <span className="req">*</span></label>
              <input className={`input ${errors.password2 ? 'error' : ''}`} type="password" value={form.password2} onChange={set('password2')} />
              {errors.password2 && <span className="err-msg">{errors.password2}</span>}
            </div>
          </div>
          <div className="field">
            <label>기수 코드 {forcedCohort ? <span className="req">(강제 적용)</span> : '(선택)'}</label>
            <input className="input" value={form.cohortCode} onChange={set('cohortCode')}
              disabled={!!forcedCohort} placeholder="예: AX3-2026"
              style={forcedCohort ? { background: 'var(--surface)' } : undefined} />
            <span className="hint">{forcedCohort
              ? `${forcedCohort.name}에 자동 배정되며 기수 코드는 변경할 수 없습니다.`
              : '미입력 시 미배정 상태로 가입되며 관리자가 배정합니다.'}</span>
          </div>
          <div className="checkbox-row">
            <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <label htmlFor="agree">개인정보 수집·이용에 동의합니다. <span className="req">*</span></label>
          </div>
          <div className="privacy-note mb-16">
            <span>{PRIVACY_NOTICE_TEXT}</span>{' '}
            <button
              type="button"
              className="privacy-link"
              aria-expanded={policyOpen}
              onClick={() => setPolicyOpen((o) => !o)}
            >
              [개인정보처리방침]
            </button>
            {policyOpen && (
              <div className="privacy-policy-box">
                <PrivacyPolicyContent />
              </div>
            )}
          </div>
          {errors.agree && <div className="err-msg mb-16" style={{ color: 'var(--danger)', fontSize: 12 }}>{errors.agree}</div>}
          <button className="btn btn-primary sheen btn-block" type="submit" disabled={busy}>
            {busy ? '가입 중…' : '회원가입'}
          </button>
        </form>
        <div className="row mt-16" style={{ justifyContent: 'center' }}>
          <Link to="/login" className="btn-text btn">이미 계정이 있으신가요? 로그인</Link>
        </div>
      </div>
      <div style={{ width: '100%', marginTop: 32 }}><FooterBar /></div>
    </div>
  )
}
