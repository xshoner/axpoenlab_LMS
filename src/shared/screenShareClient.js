import { remainingShareLease } from './screenShareLease.js'

// There is deliberately no Daily connection (or SDK load) in the constructor.
export class ScreenShareClient {
  constructor({ api, loadDaily, capture, onChange, teacher = false }) {
    Object.assign(this, { api, loadDaily, capture, onChange, teacher })
    this.clientId = crypto.randomUUID()
    this.version = 0
    this.call = null
    this.stream = null
    this.session = null
    this.heartbeat = null
    this.deadline = null
    this.snapshot = { phase: 'idle', track: null, session: null, error: '' }
  }

  emit(patch) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.onChange?.(this.snapshot)
  }

  renew(session) {
    this.session = session
    clearTimeout(this.deadline)
    this.deadline = setTimeout(() => { void this.end(this.teacher, '수업 연결이 만료되어 공유를 종료했습니다.').catch(() => {}) }, remainingShareLease(session))
  }

  async clearLocal() {
    clearInterval(this.heartbeat)
    clearTimeout(this.deadline)
    this.heartbeat = this.deadline = null
    const call = this.call
    this.call = null
    const stream = this.stream
    this.stream = null
    for (const track of stream?.getTracks() || []) track.stop()
    this.emit({ track: null })
    if (call) { try { await call.destroy() } catch { /* server ejection/expiry is the backup */ } }
  }

  async end(notifyServer = this.teacher, message = '', sessionId = this.session?.id) {
    const version = ++this.version
    this.emit({ phase: 'stopping' })
    // Publish the stop immediately; local destroy and server ejection run together.
    const stop = notifyServer && sessionId ? this.api('stop', { session_id: sessionId }) : Promise.resolve()
    const results = await Promise.allSettled([this.clearLocal(), stop])
    if (version !== this.version) return
    try {
      if (results[1].status === 'rejected') throw results[1].reason
      this.session = null
      this.emit({ phase: 'idle', session: null, error: message })
    } catch (error) {
      this.emit({ phase: 'error', error: error.message })
      throw error
    }
  }

  async start(cohortId) {
    if (!this.teacher || ['preparing','live','stopping'].includes(this.snapshot.phase)) return
    const version = ++this.version
    this.emit({ phase: 'preparing', error: '' })
    let stream
    try {
      // Must be invoked directly from the button's user gesture, before any network await.
      stream = await this.capture()
      if (version !== this.version) { for (const t of stream.getTracks()) t.stop(); return }
      this.stream = stream
      const captureTrack = stream.getVideoTracks()[0]
      captureTrack.addEventListener('ended', () => { if (this.stream === stream) void this.end().catch(() => {}) }, { once: true })
      const credentials = await this.api('start', { cohort_id: cohortId, client_id: this.clientId })
      if (version !== this.version) { await this.api('stop', { session_id: credentials.session.id }); return }
      this.renew(credentials.session)
      const Daily = await this.loadDaily()
      if (version !== this.version) return
      const call = Daily.createCallObject({ audioSource: false, videoSource: false, subscribeToTracksAutomatically: false })
      this.call = call
      call.on('error', () => { if (this.call === call) void this.end(true, '공유 연결이 끊겼습니다. 다시 시작해 주세요.').catch(() => {}) })
      call.on('left-meeting', () => { if (this.call === call) void this.end().catch(() => {}) })
      call.on('local-screen-share-stopped', () => { if (this.call === call) void this.end().catch(() => {}) })
      await call.join({ url: credentials.room, token: credentials.token, audioSource: false, videoSource: false, startAudioOff: true, startVideoOff: true })
      if (version !== this.version) return
      if (captureTrack.readyState === 'ended') throw new Error('화면 선택이 종료됐습니다. 다시 시작해 주세요.')
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('화면 송출을 시작하지 못했습니다.')), 10000)
        call.once('local-screen-share-started', () => { clearTimeout(timeout); resolve() })
        try { call.startScreenShare({ mediaStream: stream }) } catch (e) { clearTimeout(timeout); reject(e) }
      })
      if (version !== this.version) return
      const result = await this.api('activate', { session_id: this.session.id, client_id: this.clientId })
      if (version !== this.version) return
      this.renew(result.session)
      this.emit({ phase: 'live', session: result.session })
      let sending = false
      this.heartbeat = setInterval(async () => {
        if (sending || version !== this.version) return
        sending = true
        try {
          const result = await this.api('heartbeat', { session_id: this.session.id, client_id: this.clientId })
          if (version === this.version) this.renew(result.session)
        } catch { if (version === this.version) void this.end(true, '공유 연결이 끊겼습니다. 다시 시작해 주세요.').catch(() => {}) }
        finally { sending = false }
      }, 15000)
    } catch (error) {
      if (version !== this.version) return
      const message = error.name === 'NotAllowedError' ? '화면 선택을 취소했습니다.' : error.message
      try { await this.end() } catch { /* retain cleanup error below */ }
      this.emit({ error: message })
    }
  }

  async receive(session) {
    if (this.teacher) return
    if (!session || session.state !== 'live' || remainingShareLease(session) <= 0) {
      if (this.session || this.call) await this.end(false)
      return
    }
    if (this.blockedSession === session.id) return
    if (this.session?.id === session.id && (this.call || this.snapshot.phase === 'joining')) { this.renew(session); return }
    const version = ++this.version
    await this.clearLocal()
    if (version !== this.version) return
    this.renew(session)
    this.emit({ phase: 'joining', session, error: '' })
    try {
      const credentials = await this.api('token', { session_id: session.id })
      if (version !== this.version) return
      const Daily = await this.loadDaily()
      if (version !== this.version) return
      const call = Daily.createCallObject({ audioSource: false, videoSource: false })
      this.call = call
      const sync = () => {
        if (this.call !== call) return
        const participant = Object.values(call.participants()).find(p => !p.local && p.user_id === session.teacher_id)
        const screen = participant?.tracks?.screenVideo
        const track = screen?.state === 'playable' ? screen.persistentTrack || screen.track : null
        this.emit({ phase: 'live', track: track || null })
      }
      for (const event of ['participant-joined','participant-updated','track-started','track-stopped']) call.on(event, sync)
      call.on('participant-left', (event) => {
        if (this.call === call && event?.participant?.user_id === session.teacher_id) {
          this.blockedSession = session.id
          void this.end(false)
        }
        else sync()
      })
      for (const event of ['left-meeting','error']) call.on(event, () => { if (this.call === call) void this.end(false) })
      await call.join({ url: credentials.room, token: credentials.token, audioSource: false, videoSource: false, startAudioOff: true, startVideoOff: true })
      if (version === this.version) sync()
    } catch (error) {
      if (version !== this.version) return
      await this.end(false)
      this.emit({ error: error.message })
    }
  }
}
