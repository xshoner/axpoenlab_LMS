import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STUDENT_STATS_REFRESH_MS = 60000
const ADMIN_ONLINE_REFRESH_MS = 60000

export function useStudentPresenceTrack(userId) {
  const [stats, setStats] = useState({ userId: null, data: null })
  useEffect(() => {
    if (!userId) return
    let alive = true, pending = false, lastStatsAt = 0
    async function poll() {
      if (document.visibilityState !== 'visible' || pending) return
      pending = true
      try {
        await supabase.rpc('heartbeat').abortSignal(AbortSignal.timeout(10000))
        if (!alive || document.visibilityState !== 'visible') return
        if (Date.now() - lastStatsAt >= STUDENT_STATS_REFRESH_MS) {
          const { data, error } = await supabase.rpc('student_service_stats').abortSignal(AbortSignal.timeout(10000))
          if (alive && !error && data) {
            lastStatsAt = Date.now()
            setStats({ userId, data })
          }
        }
      } catch { /* retain the last counter on a transient failure */ }
      finally { pending = false }
    }
    void poll()
    const timer = setInterval(poll, 30000)
    const resume = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      alive = false; clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [userId])
  return userId === stats.userId ? stats.data : null
}

export function useOnlineStudentCount(cohortId = null) {
  const [result, setResult] = useState({ cohortId: null, count: 0 })
  useEffect(() => {
    let alive = true, pending = false, lastResumeAt = Date.now()
    async function poll() {
      if (document.visibilityState !== 'visible' || pending) return
      pending = true
      try {
        const { data, error } = await supabase.rpc('online_student_count', { p_cohort_id: cohortId })
          .abortSignal(AbortSignal.timeout(10000))
        if (alive && !error) setResult({ cohortId, count: Number(data) || 0 })
      } catch { /* keep the last count until the connection recovers */ }
      finally { pending = false }
    }
    void poll()
    const timer = setInterval(poll, ADMIN_ONLINE_REFRESH_MS)
    const resume = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastResumeAt < 1000) return
      lastResumeAt = Date.now()
      void poll()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      alive = false; clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [cohortId])
  return result.cohortId === cohortId ? result.count : 0
}

/** 관리자 화면: 미답변(open) 문의 건수를 실시간으로 반환한다. cohortId를 주면 해당 기수 학생의 문의만 센다. */
export function useOpenInquiryCount(refreshKey, cohortId = null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const fetchCount = async () => {
      let q = supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open')
      if (cohortId) {
        const { data: members } = await supabase.from('cohort_members').select('user_id').eq('cohort_id', cohortId)
        const ids = (members || []).map((m) => m.user_id)
        if (ids.length === 0) { if (alive) setCount(0); return }
        q = q.in('user_id', ids)
      }
      const { count: c } = await q
      if (alive) setCount(c || 0)
    }
    fetchCount()
    const ch = supabase.channel('lms-inquiries-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, fetchCount)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [refreshKey, cohortId])
  return count
}
