import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext({ session: undefined, profile: null, cohort: null })

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [profile, setProfile] = useState(null)
  const [cohort, setCohort] = useState(null)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); setCohort(null); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(p || null)
    const { data: m } = await supabase
      .from('cohort_members')
      .select('cohort_id, cohorts(id, name, code, status, start_date, end_date)')
      .eq('user_id', uid)
      .maybeSingle()
    setCohort(m?.cohorts || null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      loadProfile(data.session?.user?.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') loadProfile(s?.user?.id)
      if (event === 'SIGNED_OUT') { setProfile(null); setCohort(null) }
      if (event === 'PASSWORD_RECOVERY') {
        // 재설정 메일 링크로 진입 — 대시보드 대신 비밀번호 변경 화면 유지
        sessionStorage.setItem('ax-recovery', '1')
        window.location.hash = '#/reset'
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  // Record each app entry/account change and return to the tab, independently of counter visibility.
  useEffect(() => {
    if (!session?.user?.id || profile?.id !== session.user.id || profile?.status !== 'active') return
    const record = () => {
      if (document.visibilityState !== 'visible') return
      supabase.rpc('record_visit').then(({ error }) => {
        if (!error) window.dispatchEvent(new Event('ax-visit-recorded'))
      }).catch(() => { /* Access tracking must not block the app. */ })
    }
    record()
    document.addEventListener('visibilitychange', record)
    return () => document.removeEventListener('visibilitychange', record)
  }, [session?.user?.id, profile?.id, profile?.status])

  const refresh = useCallback(() => loadProfile(session?.user?.id), [session, loadProfile])

  return (
    <AuthCtx.Provider value={{ session, profile, cohort, refresh }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}

export function InactiveAccount() {
  return (
    <div className="auth-wrap">
      <div className="auth-panel" style={{ textAlign: 'center' }}>
        <div className="t-h2 mb-16">비활성화된 계정입니다</div>
        <p className="t-body muted mb-16">
          이 계정은 현재 LMS를 이용할 수 없습니다.<br />관리자에게 계정 활성화를 요청해 주세요.
        </p>
        <button className="btn btn-primary btn-block" onClick={signOut}>로그아웃</button>
      </div>
    </div>
  )
}

export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/'
}
