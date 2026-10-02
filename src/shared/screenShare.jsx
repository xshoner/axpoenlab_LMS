import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconScreenShare, IconScreenShareOff } from '@tabler/icons-react'
import { ANON_KEY, FUNCTIONS_URL, getAdminView, supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { useToast } from './ui'
import { ScreenShareClient } from './screenShareClient'
import './screenShare.css'

const ERRORS = {
  daily_not_configured: '화면 공유 서버 설정을 확인해 주세요.',
  daily_unavailable: '화면 공유에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  share_busy: '다른 화면 공유가 진행 중입니다.',
  cooling_down: '이전 연결을 정리하고 있습니다. 약 35초 후 다시 시작해 주세요.',
  share_ended: '화면 공유가 종료됐습니다.',
  forbidden: '화면 공유 권한이 없습니다.',
  select_cohort: '공유할 기수를 먼저 선택해 주세요.',
}
async function api(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('screen-share', { body: { action, ...body } })
  if (error) {
    let code
    try { code = (await error.context.json()).error } catch { /* transport error */ }
    throw new Error(ERRORS[code] || '화면 공유 연결을 확인해 주세요.')
  }
  return data
}
const loadDaily = async () => (await import('@daily-co/daily-js')).default

function useCurrentShare(enabled, cohortId) {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    if (!enabled) { setCurrent(null); return }
    let alive = true, revision = 0
    const read = async () => {
      const request = ++revision
      let q = supabase.from('screen_share_sessions').select('id,cohort_id,teacher_id,state,lease_until,started_at')
        .in('state', cohortId ? ['live'] : ['starting','live','stopping']).gt('lease_until', new Date().toISOString())
      if (cohortId) q = q.eq('cohort_id', cohortId)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (alive && revision === request && !error) setCurrent(data)
    }
    void read()
    const channel = supabase.channel(`screen-share:${cohortId || 'super'}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_share_sessions', ...(cohortId ? { filter: `cohort_id=eq.${cohortId}` } : {}) }, read)
      .subscribe(status => { if (status === 'SUBSCRIBED') void read() })
    const timer = setInterval(read, 5000)
    const visible = () => { if (document.visibilityState === 'visible') void read() }
    document.addEventListener('visibilitychange', visible)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel) }
  }, [enabled, cohortId])
  // A lost Realtime connection must not extend a billed session indefinitely.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => setCurrent(null), Math.max(0, Date.parse(current.lease_until) - Date.now()))
    return () => clearTimeout(timer)
  }, [current])
  return enabled && (!cohortId || current?.cohort_id === cohortId) ? current : null
}

function useShareClient(teacher) {
  const [snapshot, setSnapshot] = useState({ phase: 'idle', track: null, session: null, error: '' })
  const [client] = useState(() => new ScreenShareClient({
    api, loadDaily, teacher, onChange: setSnapshot,
    capture: () => navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: 15 }, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'exclude' }),
  }))
  useEffect(() => () => { void client.end(teacher).catch(() => {}) }, [client, teacher])
  return [client, snapshot]
}

export function TeacherScreenShareButton({ cohortId, cohorts }) {
  const { session } = useAuth()
  const toast = useToast()
  const current = useCurrentShare(true, null)
  const [client, snapshot] = useShareClient(true)
  const [minutes, setMinutes] = useState(null)
  const active = current || snapshot.session
  const busy = ['preparing','stopping'].includes(snapshot.phase)
  useEffect(() => {
    let alive = true
    supabase.rpc('screen_share_monthly_usage').then(({ data, error }) => { if (alive && !error) setMinutes(Number(data)) })
    return () => { alive = false }
  }, [snapshot.phase])
  useEffect(() => { if (snapshot.error) toast(snapshot.error, 'error') }, [snapshot.error, toast])
  useEffect(() => {
    const id = snapshot.session?.id
    if (snapshot.phase !== 'error' || !id) return
    let alive = true
    const reconcile = async () => {
      const { data } = await supabase.from('screen_share_sessions').select('state').eq('id', id).maybeSingle()
      if (alive && data?.state === 'ended' && client.session?.id === id) void client.end(false)
    }
    void reconcile()
    const timer = setInterval(reconcile, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [client, snapshot.phase, snapshot.session?.id])
  useEffect(() => {
    const exit = () => {
      const id = client.session?.id
      if (!id) return
      // keepalive sends the stop even as the page closes; room expiry is the server backup.
      void fetch(`${FUNCTIONS_URL}/screen-share`, { method: 'POST', keepalive: true,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', session_id: id }),
      }).catch(() => {})
      void client.end(false)
    }
    window.addEventListener('pagehide', exit)
    return () => window.removeEventListener('pagehide', exit)
  }, [client, session.access_token])
  async function toggle() {
    if (active) {
      try { await client.end(true, '', active.id) } catch (e) { toast(e.message, 'error') }
    } else if (!cohortId) toast('공유할 기수를 먼저 선택해 주세요.', 'error')
    else await client.start(cohortId)
  }
  const name = cohorts.find(c => c.id === (active?.cohort_id || cohortId))?.name
  return <button type="button" className={`inq-pill screen-share-button ${active ? 'sharing' : ''}`} onClick={toggle} disabled={busy}
    title={`${active ? `${name || '선택한 기수'} 공유 중 · 클릭하면 모두 연결 해제` : '선택한 기수에 화면 공유'}${minutes === null ? '' : ` · 이번 달 약 ${minutes.toLocaleString()} 참가자·분 (접속 인원 샘플 기준 추정)`}`}>
    {active ? <IconScreenShareOff size={15} /> : <IconScreenShare size={15} />}
    <span>{busy ? (snapshot.phase === 'preparing' ? '공유 준비 중' : '연결 해제 중') : active ? '공유해제' : '화면공유'}</span>
    {minutes !== null && <span className="share-usage">이달 {minutes.toLocaleString()} 인·분</span>}
  </button>
}

export function StudentScreenShare() {
  const { session, profile, cohort } = useAuth()
  const enabled = !!(session && profile?.status === 'active' && profile.role === 'student' && cohort?.id && !getAdminView() && sessionStorage.getItem('ax-recovery') !== '1')
  const active = useCurrentShare(enabled, enabled ? cohort.id : null)
  const [client, snapshot] = useShareClient(false)
  const video = useRef(null)
  const modal = useRef(null)
  useEffect(() => { void client.receive(enabled ? active : null) }, [client, active, enabled])
  useEffect(() => {
    if (!video.current) return
    const element = video.current
    element.srcObject = snapshot.track ? new MediaStream([snapshot.track]) : null
    if (snapshot.track) void element.play().catch(() => {})
    return () => { element.srcObject = null }
  }, [snapshot.track, !!active])
  useEffect(() => {
    if (!active) return
    const root = document.getElementById('root')
    const inert = root.inert, overflow = document.body.style.overflow, focus = document.activeElement
    root.inert = true
    document.body.style.overflow = 'hidden'
    modal.current?.focus()
    return () => { root.inert = inert; document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus() }
  }, [active?.id])
  if (!enabled || !active) return null
  return createPortal(<section className="student-screen-share" ref={modal} tabIndex={-1} role="dialog" aria-modal="true" aria-label="교사 화면 공유">
    <video ref={video} autoPlay playsInline muted className="student-shared-video" />
    {!snapshot.track && <div className="screen-share-loading" role="status">교사 화면을 연결하고 있습니다…</div>}
    <span className="screen-share-live-label">교사 화면 공유</span>
  </section>, document.body)
}
