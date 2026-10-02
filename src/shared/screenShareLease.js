// Server TTL + monotonic browser time: PC wall clocks can differ by minutes.
export function receiveShareSession(session, requestStarted = performance.now()) {
  if (!session) return null
  const elapsed = Math.max(0, performance.now() - requestStarted)
  const ttl = Number(session.lease_remaining_ms)
  return {
    ...session,
    lease_deadline: performance.now() + Math.max(0, Number.isFinite(ttl)
      ? ttl - elapsed : Date.parse(session.lease_until) - Date.now()),
  }
}

export function remainingShareLease(session) {
  if (!session) return 0
  return Math.max(0, Number.isFinite(session.lease_deadline)
    ? session.lease_deadline - performance.now() : Date.parse(session.lease_until) - Date.now())
}
