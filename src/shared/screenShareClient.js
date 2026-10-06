import { remainingShareLease } from './screenShareLease.js'

function bounded(promise, ms) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('공유 연결 응답이 지연되고 있습니다. 다시 시도해 주세요.')), ms)
  })]).finally(() => clearTimeout(timer))
}

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
    this.mediaDeadline = null
    this.networkDeadline = null
    this.attempts = 0
    this.attemptSession = null
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
    clearTimeout(this.mediaDeadline)
    clearTimeout(this.networkDeadline)
    this.heartbeat = this.deadline = null
    this.mediaDeadline = null
    this.networkDeadline = null
    const call = this.call
    this.call = null
    const stream = this.stream
    this.stream = null
    for (const track of stream?.getTracks() || []) track.stop()
    this.emit({ track: null })
    if (call) {
      // Initiate both paths immediately. A stuck destroy must not retain a billed call.
      try { void Promise.resolve(call.leave?.()).catch(() => {}) } catch { /* destroy below */ }
      try { await bounded(call.destroy(), 5000) } catch { /* server ejection/watchdog is the backup */ }
    }
  }

  async join(call, options, version) {
    const joining = call.join(options)
    void Promise.resolve(joining).then(() => {
      if (version === this.version) return
      // Some SDK/network operations resolve after cancellation. Close that late admission too.
      try { void Promise.resolve(call.leave?.()).catch(() => {}) } catch { /* already destroyed */ }
      try { void Promise.resolve(call.destroy()).catch(() => {}) } catch { /* already destroyed */ }
    }).catch(() => {})
    await bounded(joining, 15000)
  }

  watchConnection(call) {
    const interrupted = new Set()
    call.on('network-connection', ({ type, event }) => {
      if (this.call !== call) return
      if (event === 'connected') interrupted.delete(type)
      if (event === 'interrupted') interrupted.add(type)
      if (!interrupted.size) { clearTimeout(this.networkDeadline); this.networkDeadline = null }
      else if (!this.networkDeadline) {
        // SDK reconnection can recover a brief interruption, but media cannot stall forever.
        this.networkDeadline = setTimeout(() => {
          if (this.call === call) void this.end(this.teacher, '연결 복구 시간이 초과되었습니다. 다시 연결해 주세요.').catch(() => {})
        }, 30000)
      }
    })
  }

  async end(notifyServer = this.teacher, message = '', sessionId = this.session?.id) {
    const version = ++this.version
    this.emit({ phase: 'stopping' })
    // Publish the stop immediately; local destroy and server ejection run together.
    const stop = notifyServer && sessionId ? bounded(this.api('stop', { session_id: sessionId }), 110000) : Promise.resolve()
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
      // Retain cleanup for a start that completes after cancellation or a lost response.
      const request = this.api('start', { cohort_id: cohortId, client_id: this.clientId })
      void request.then(credentials => {
        if (version !== this.version) void bounded(this.api('stop', { session_id: credentials.session.id }), 110000).catch(() => {})
      }).catch(() => {})
      const credentials = await bounded(request, 35000)
      if (version !== this.version) return
      this.renew(credentials.session)
      this.emit({ session: credentials.session })
      const Daily = await bounded(this.loadDaily(), 15000)
      if (version !== this.version) return
      const call = Daily.createCallObject({ audioSource: false, videoSource: false, subscribeToTracksAutomatically: false })
      this.call = call
      this.watchConnection(call)
      call.on('error', () => { if (this.call === call) void this.end(true, '공유 연결이 끊겼습니다. 다시 시작해 주세요.').catch(() => {}) })
      call.on('left-meeting', () => { if (this.call === call) void this.end().catch(() => {}) })
      call.on('local-screen-share-stopped', () => { if (this.call === call) void this.end().catch(() => {}) })
      await this.join(call, { url: credentials.room, token: credentials.token, audioSource: false, videoSource: false, startAudioOff: true, startVideoOff: true }, version)
      if (version !== this.version) return
      if (captureTrack.readyState === 'ended') throw new Error('화면 선택이 종료됐습니다. 다시 시작해 주세요.')
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('화면 송출을 시작하지 못했습니다.')), 10000)
        call.once('local-screen-share-started', () => { clearTimeout(timeout); resolve() })
        try { void Promise.resolve(call.startScreenShare({ mediaStream: stream })).catch(e => { clearTimeout(timeout); reject(e) }) } catch (e) { clearTimeout(timeout); reject(e) }
      })
      if (version !== this.version) return
      const result = await bounded(this.api('activate', { session_id: this.session.id, client_id: this.clientId }), 10000)
      if (version !== this.version) return
      this.renew(result.session)
      this.emit({ phase: 'live', session: result.session })
      let sending = false
      this.heartbeat = setInterval(async () => {
        if (sending || version !== this.version) return
        sending = true
        try {
          if (captureTrack.readyState === 'ended') throw new Error('화면 공유가 종료됐습니다.')
          const result = await bounded(this.api('heartbeat', { session_id: this.session.id, client_id: this.clientId }), 10000)
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
    if (this.snapshot.phase === 'stopping') return
    if (this.session?.id === session.id && (this.call || this.snapshot.phase === 'joining')) {
      // State polling may renew a live call, never the independent join deadline.
      this.renew(session); return
    }
    if (this.attemptSession !== session.id) { this.attemptSession = session.id; this.attempts = 0 }
    if (this.attempts >= 3) return
    this.attempts++
    const version = ++this.version
    await this.clearLocal()
    if (version !== this.version) return
    this.renew(session)
    this.emit({ phase: 'joining', session, error: '' })
    try {
      const credentials = await bounded(this.api('token', { session_id: session.id }), 10000)
      if (version !== this.version) return
      if (remainingShareLease(session) <= 0) { await this.end(false); return }
      const Daily = await bounded(this.loadDaily(), 15000)
      if (version !== this.version) return
      if (remainingShareLease(session) <= 0) { await this.end(false); return }
      const call = Daily.createCallObject({ audioSource: false, videoSource: false })
      this.call = call
      this.watchConnection(call)
      const sync = () => {
        if (this.call !== call) return
        const participant = Object.values(call.participants()).find(p => !p.local && p.user_id === session.teacher_id)
        const screen = participant?.tracks?.screenVideo
        const track = screen?.state === 'playable' ? screen.persistentTrack || screen.track : null
        if (track) { clearTimeout(this.mediaDeadline); this.mediaDeadline = null }
        else if (!this.mediaDeadline) {
          this.mediaDeadline = setTimeout(() => {
            if (this.call === call) void this.end(false, '교사 영상을 수신하지 못했습니다. 다시 연결해 주세요.').catch(() => {})
          }, 15000)
        }
        this.emit({ phase: track ? 'live' : 'joining', track: track || null })
      }
      for (const event of ['participant-joined','participant-updated','track-started','track-stopped']) call.on(event, sync)
      call.on('participant-left', (event) => {
        if (this.call === call && event?.participant?.user_id === session.teacher_id) {
          this.blockedSession = session.id
          void this.end(false)
        }
        else sync()
      })
      call.on('left-meeting', () => {
        if (this.call !== call) return
        this.blockedSession = session.id
        void this.end(false)
      })
      call.on('error', () => { if (this.call === call) void this.end(false, '공유 연결이 끊겼습니다. 다시 연결해 주세요.').catch(() => {}) })
      await this.join(call, { url: credentials.room, token: credentials.token, audioSource: false, videoSource: false, startAudioOff: true, startVideoOff: true }, version)
      if (version === this.version) sync()
    } catch (error) {
      if (version !== this.version) return
      await this.end(false)
      this.emit({ error: error.message })
    }
  }

  async retry(session) {
    if (this.teacher || this.blockedSession === session?.id) return
    this.attempts = 0
    await this.receive(session)
  }
}
