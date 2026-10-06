import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStudentPresenceTrack(userId) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    if (!userId) return
    let alive = true, pending = false
    async function poll() {
      if (pending) return
      pending = true
      try {
        await supabase.rpc('heartbeat').abortSignal(AbortSignal.timeout(10000))
        const { data, error } = await supabase.rpc('student_service_stats').abortSignal(AbortSignal.timeout(10000))
        if (alive && !error) setStats(data)
      } catch { /* retain the last counter on a transient failure */ }
      finally { pending = false }
    }
    poll()
    const timer = setInterval(poll, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [userId])
  return userId ? stats : null
}

export function useOnlineStudentCount(cohortId = null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    async function poll() {
      const { data } = await supabase.rpc('online_student_count', { p_cohort_id: cohortId })
      if (alive) setCount(data || 0)
    }
    poll()
    const timer = setInterval(poll, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [cohortId])
  return count
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
