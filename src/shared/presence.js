import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL = 'lms-online-students'

/** 학생 화면: 로그인한 학생의 접속 상태를 Presence 채널에 기록하고, 현재 접속 학생 수를 반환한다. */
export function useStudentPresenceTrack(userId) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } })
    const sync = () => setCount(Object.keys(ch.presenceState()).length)
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })
    return () => { supabase.removeChannel(ch) }
  }, [userId])
  return count
}

/** 관리자 화면: 현재 접속 중인 학생 수(고유 사용자 기준)를 실시간으로 반환한다. */
export function useOnlineStudentCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const ch = supabase.channel(CHANNEL)
    const sync = () => setCount(Object.keys(ch.presenceState()).length)
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  return count
}

/** 관리자 화면: 미답변(open) 문의 건수를 DB 변경 이벤트에 맞춰 실시간으로 반환한다. */
export function useOpenInquiryCount(refreshKey) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const fetchCount = () => {
      supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open')
        .then(({ count: c }) => { if (alive) setCount(c || 0) })
    }
    fetchCount()
    const ch = supabase.channel('lms-inquiries-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, fetchCount)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [refreshKey])
  return count
}
