import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL = 'lms-online-students'

/** 학생 화면: 로그인한 학생의 접속 상태를 Presence 채널에 기록하고, 현재 접속 학생 수를 반환한다. */
// presenceState: { [userId]: [{ user_id, cohort_id, online_at }] } — 기수 필터 시 같은 기수 사용자만 센다
function countOnline(ch, cohortId) {
  const state = ch.presenceState()
  if (!cohortId) return Object.keys(state).length
  return Object.values(state).filter((metas) => metas.some((m) => m.cohort_id === cohortId)).length
}

export function useStudentPresenceTrack(userId, cohortId = null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } })
    const sync = () => setCount(countOnline(ch, cohortId))
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, cohort_id: cohortId, online_at: new Date().toISOString() })
        }
      })
    return () => { supabase.removeChannel(ch) }
  }, [userId, cohortId])
  return count
}

/** 관리자 화면: 현재 접속 중인 학생 수(고유 사용자 기준). cohortId를 주면 해당 기수만 센다. */
export function useOnlineStudentCount(cohortId = null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const ch = supabase.channel(CHANNEL)
    const sync = () => setCount(countOnline(ch, cohortId))
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
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
