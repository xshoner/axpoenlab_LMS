import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { LoadError, reportClientError } from './errors'

const AuthCtx = createContext({ session: undefined, profile: null, cohort: null })
const PROFILE_RETRY_DELAYS = [400, 1200]

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [profile, setProfile] = useState(null)
  const [cohort, setCohort] = useState(null)
  const [profileError, setProfileError] = useState(false)
  const profileRequest = useRef(null)
  const profileVersion = useRef(0)
  const profileUid = useRef(null)
  const authVersion = useRef(0)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      profileVersion.current++
      profileRequest.current = null
      profileUid.current = null
      setProfile(null); setCohort(null); setProfileError(false); return
    }
    if (profileRequest.current?.uid === uid) return profileRequest.current.promise
    const request = { uid, version: ++profileVersion.current }
    if (profileUid.current !== uid) {
      profileUid.current = uid
      setProfile(null); setCohort(null)
    }
    request.promise = (async () => {
      setProfileError(false)
      for (let attempt = 0; attempt <= PROFILE_RETRY_DELAYS.length; attempt++) {
        try {
          const [{ data: p, error: pe }, { data: m, error: me }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', uid).abortSignal(AbortSignal.timeout(15000)).single(),
            supabase.from('cohort_members')
              .select('cohort_id, cohorts(id, name, code, status, start_date, end_date)')
              .eq('user_id', uid).abortSignal(AbortSignal.timeout(15000)).maybeSingle(),
          ])
          if (request.version !== profileVersion.current) return
          if (pe || me || !p) throw new Error('PROFILE_LOAD_FAILED')
          if (p.role !== 'super_admin') sessionStorage.removeItem('ax-admin-view')
          // Publish both together so the dashboard never loads without membership.
          setCohort(m?.cohorts || null)
          setProfile(p)
          return
        } catch {
          if (request.version !== profileVersion.current) return
          if (attempt === PROFILE_RETRY_DELAYS.length) {
            setProfileError(true)
            reportClientError('load', 'PROFILE_LOAD_FAILED')
            return
          }
          await new Promise(resolve => setTimeout(resolve, PROFILE_RETRY_DELAYS[attempt]))
          if (request.version !== profileVersion.current) return
        }
      }
    })().finally(() => {
      if (profileRequest.current === request) profileRequest.current = null
    })
    profileRequest.current = request
    return request.promise
  }, [])

  useEffect(() => {
    const initialVersion = authVersion.current
    supabase.auth.getSession().then(({ data }) => {
      if (initialVersion !== authVersion.current) return
      setSession(data.session ?? null)
      void loadProfile(data.session?.user?.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const version = ++authVersion.current
      setSession(s ?? null)
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') queueMicrotask(() => { if (authVersion.current === version) void loadProfile(s?.user?.id) })
      if (event === 'SIGNED_OUT') loadProfile(null)
      if (event === 'PASSWORD_RECOVERY') {
        // 재설정 메일 링크로 진입 — 대시보드 대신 비밀번호 변경 화면 유지
        sessionStorage.setItem('ax-recovery', '1')
        window.location.hash = '#/reset'
      }
    })
    return () => {
      authVersion.current++
      profileVersion.current++
      profileRequest.current = null
      sub.subscription.unsubscribe()
    }
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
    <AuthCtx.Provider value={{ session, profile, cohort, refresh, profileError }}>
      {profileError && session ? <LoadError title="계정 정보를 불러오지 못했습니다" retry={refresh} /> : children}
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
  sessionStorage.removeItem('ax-admin-view')
  await supabase.auth.signOut()
  window.location.href = '/'
}
