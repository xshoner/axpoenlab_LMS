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
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

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

export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/'
}
