import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconScreenShare, IconScreenShareOff } from '@tabler/icons-react'
import { ANON_KEY, FUNCTIONS_URL, getAdminView, supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, useToast } from './ui'
import { reportClientError } from './errors'
import { ScreenShareClient } from './screenShareClient'
import { receiveShareSession, remainingShareLease } from './screenShareLease'
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
  const requestedAt = performance.now()
  const { data, error } = await supabase.functions.invoke('screen-share', { body: { action, ...body } })
  if (error) {
    let code
    try { code = (await error.context.json()).error } catch { /* transport error */ }
    throw new Error(ERRORS[code] || '화면 공유 연결을 확인해 주세요.')
  }
  return data?.session ? { ...data, session: receiveShareSession(data.session, requestedAt) } : data
}
const loadDaily = async () => (await import('@daily-co/daily-js')).default

function useCurrentShare(enabled, cohortId) {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    if (!enabled) { setCurrent(null); return }
    let alive = true, reading = false, queued = false, connected = false, live = false, timer
    const read = async () => {
      if (!alive) return
      if (reading) { queued = true; return }
      reading = true
      clearTimeout(timer)
      const requestedAt = performance.now()
      try {
        const { data, error } = await supabase.rpc('screen_share_current', { p_cohort: cohortId || null }).abortSignal(AbortSignal.timeout(15000))
        if (alive && !error) { live = !!data; setCurrent(receiveShareSession(data, requestedAt)) }
        if (alive && error) reportClientError('share', 'SHARE_STATE_FAILED')
      } catch { if (alive) reportClientError('share', 'SHARE_STATE_FAILED') } finally {
        reading = false
        if (alive) timer = setTimeout(read, queued ? 0 : !connected ? 5000 : live ? 15000 : document.visibilityState === 'visible' ? 30000 : 60000)
        queued = false
      }
    }
    void read()
    const channel = supabase.channel(`screen-share:${cohortId || 'super'}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_share_sessions', ...(cohortId ? { filter: `cohort_id=eq.${cohortId}` } : {}) }, read)
      .subscribe(status => { connected = status === 'SUBSCRIBED'; if (connected) void read(); else { clearTimeout(timer); timer = setTimeout(read, 5000) } })
    const visible = () => { if (document.visibilityState === 'visible') void read() }
    document.addEventListener('visibilitychange', visible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel) }
  }, [enabled, cohortId])
  // A lost Realtime connection must not extend a billed session indefinitely.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => setCurrent(null), remainingShareLease(current))
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
  return <><button type="button" className={`inq-pill screen-share-button ${active ? 'sharing' : ''}`} onClick={toggle} disabled={busy}
    title={`${active ? `${name || '선택한 기수'} 공유 중 · 클릭하면 모두 연결 해제` : '선택한 기수에 화면 공유'}${minutes === null ? '' : ` · 이번 달 약 ${minutes.toLocaleString()} 참가자·분 (접속 인원 샘플 기준 추정)`}`}>
    {active ? <IconScreenShareOff size={15} /> : <IconScreenShare size={15} />}
    <span>{busy ? (snapshot.phase === 'preparing' ? '공유 준비 중' : '연결 해제 중') : active ? '공유해제' : '화면공유'}</span>
    {minutes !== null && <span className="share-usage">이달 {minutes.toLocaleString()} 인·분</span>}
  </button>{active?.id && <ReceiverStatus sessionId={active.id} name={name} />}</>
}

const RECEIVER_LABELS = { receiving: '수신 중', connecting: '연결 중', reconnecting: '재연결 중', error: '연결 실패', waiting: '수신 대기', ended: '공유 종료' }
function ReceiverStatus({ sessionId, name }) {
  const [students, setStudents] = useState([]), [open, setOpen] = useState(false), [error, setError] = useState(false)
  useEffect(() => {
    let alive = true, pending = false
    setStudents([])
    const read = async () => {
      if (pending) return
      pending = true
      try {
        const { data, error } = await supabase.rpc('screen_share_receiver_status', { p_session: sessionId })
        if (alive) { setError(!!error); if (!error) setStudents(data?.students || []) }
      } finally { pending = false }
    }
    void read()
    const timer = setInterval(read, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId])
  const receiving = students.filter(s => s.state === 'receiving').length
  return <><button type="button" className="inq-pill" onClick={() => setOpen(true)} title="학생의 영상 수신 현황">
    {error ? '수신 현황 확인 필요' : `수신 ${receiving}/${students.length}명`}
  </button><Dialog open={open} title={`${name || '선택한 기수'} · 화면공유 수신 현황`} onClose={() => setOpen(false)}>
    <p className="t-muted-sm mb-16">영상 수신 보고 기준으로 갱신됩니다. 수신 대기는 미접속 또는 아직 연결되지 않은 상태입니다.</p>
    <table className="data-table"><thead><tr><th>학생</th><th>수신 상태</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td>{s.name}</td><td>{RECEIVER_LABELS[s.state] || s.state}</td></tr>)}</tbody></table>
  </Dialog></>
}

export function StudentScreenShare() {
  const { session, profile, cohort } = useAuth()
  const enabled = !!(session && profile?.status === 'active' && profile.role === 'student' && cohort?.id && !getAdminView() && sessionStorage.getItem('ax-recovery') !== '1')
  const active = useCurrentShare(enabled, enabled ? cohort.id : null)
  const [client, snapshot] = useShareClient(false)
  const video = useRef(null)
  const modal = useRef(null)
  const [playing, setPlaying] = useState(false)
  const receiverState = playing ? 'receiving' : snapshot.error ? 'error' : snapshot.phase === 'joining' ? 'connecting' : 'reconnecting'
  const reportState = useRef(receiverState)
  useEffect(() => { void client.receive(enabled ? active : null) }, [client, active, enabled])
  useEffect(() => {
    if (!video.current) return
    const element = video.current
    let alive = true
    setPlaying(false)
    element.srcObject = snapshot.track ? new MediaStream([snapshot.track]) : null
    if (snapshot.track) void element.play().then(() => { if (alive) setPlaying(true) }).catch(() => { reportClientError('share', 'SHARE_PLAY_FAILED') })
    return () => { alive = false; element.srcObject = null }
  }, [snapshot.track, !!active])
  useEffect(() => {
    if (!enabled || !active?.id) return
    const report = (state) => { void Promise.resolve(supabase.rpc('screen_share_report', { p_session: active.id, p_client: client.clientId, p_state: state })).catch(() => {}) }
    const timer = setInterval(() => report(reportState.current), 15000)
    return () => { clearInterval(timer); report('ended') }
  }, [client, enabled, active?.id])
  useEffect(() => {
    reportState.current = receiverState
    if (enabled && active?.id) void Promise.resolve(supabase.rpc('screen_share_report', { p_session: active.id, p_client: client.clientId, p_state: receiverState })).catch(() => {})
  }, [client, enabled, active?.id, receiverState])
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
