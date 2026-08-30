import { useCallback, useEffect, useState } from 'react'
import { IconHandStop, IconPlayerPlay, IconCheck, IconPhoto, IconTrash, IconRotate } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, Dialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { waitLabel, useNowTick } from '../../shared/help'
import { fmtDate } from '../../lib/helpers'

/* 도움 요청 대기열 — 대기/처리 중 요청을 접수 순서대로 표시. [처리 시작] → [해결]. 오늘 해결된 요청은 아래에 접힘. */
export default function HelpQueue() {
  const { profile } = useAuth()
  const { selectedId, cohorts } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [resolved, setResolved] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [shot, setShot] = useState(null) // { url, row }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const now = useNowTick(15000)
  const handler = profile.nickname || profile.name

  const load = useCallback(async () => {
    let q = supabase.from('help_requests').select('*').in('status', ['waiting', 'in_progress']).order('created_at')
    let r = supabase.from('help_requests').select('*').eq('status', 'resolved')
      .gte('resolved_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('resolved_at', { ascending: false }).limit(50)
    if (selectedId) { q = q.eq('cohort_id', selectedId); r = r.eq('cohort_id', selectedId) }
    const [aQ, rQ] = await Promise.all([q, r])
    setRows(aQ.data || [])
    setResolved(rQ.data || [])
  }, [selectedId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('lms-help-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function setStatus(row, status) {
    setBusy(true)
    const patch = status === 'in_progress'
      ? { status, started_at: new Date().toISOString(), handler_name: handler }
      : status === 'resolved'
        ? { status, resolved_at: new Date().toISOString(), handler_name: row.handler_name || handler }
        : { status, started_at: null, resolved_at: null, handler_name: null }
    const { error } = await supabase.from('help_requests').update(patch).eq('id', row.id)
    setBusy(false)
    if (error) { toast('상태 변경에 실패했습니다.', 'error'); return }
    load()
  }

  async function openShot(row) {
    const { data, error } = await supabase.storage.from('help-files').createSignedUrl(row.screenshot_path, 600)
    if (error) { toast('스크린샷을 불러올 수 없습니다.', 'error'); return }
    setShot({ url: data.signedUrl, row })
  }

  async function doDelete() {
    setBusy(true)
    const { error } = await supabase.from('help_requests').delete().eq('id', deleteTarget.id)
    setBusy(false)
    setDeleteTarget(null)
    if (error) { toast('삭제에 실패했습니다.', 'error'); return }
    load()
  }

  if (!rows) return <Loading />

  const cohortName = (id) => cohorts.find((c) => c.id === id)?.name || '-'
  const waiting = rows.filter((r) => r.status === 'waiting').length
  const inProgress = rows.length - waiting

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <h2 className="t-h2 row" style={{ gap: 10 }}>
          <IconHandStop size={22} stroke={1.75} color="var(--danger)" /> 도움 요청 대기열
          <span className="t-muted-sm tnum">대기 {waiting}명 · 처리 중 {inProgress}명</span>
        </h2>
        <span className="t-caption muted-soft">실시간 갱신 · 학생이 상단 🙋 버튼으로 요청하면 즉시 표시됩니다{selectedId ? '' : ' (전체 기수)'}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={IconHandStop} title="대기 중인 도움 요청이 없습니다" description="학생이 도움을 요청하면 접수 순서대로 여기에 표시됩니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table help-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>대기</th>
                <th style={{ width: 130 }}>학생</th>
                {!selectedId && <th style={{ width: 130 }}>기수</th>}
                <th style={{ width: 120 }}>문제</th>
                <th>설명</th>
                <th style={{ width: 90 }}>대기시간</th>
                <th style={{ width: 230 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.status === 'in_progress' ? 'help-row-progress' : ''}>
                  <td className="tnum" style={{ fontWeight: 700, fontSize: 16, color: r.status === 'in_progress' ? 'var(--success)' : 'var(--danger)' }}>
                    {r.status === 'in_progress' ? <IconPlayerPlay size={16} stroke={2} /> : i + 1}
                  </td>
                  <td>
                    <div className="t-emph">{r.student_name}</div>
                    {r.student_org && <div className="t-caption muted-soft">{r.student_org}</div>}
                  </td>
                  {!selectedId && <td className="t-muted-sm">{cohortName(r.cohort_id)}</td>}
                  <td><span className="pill pill-neutral">{r.category}</span></td>
                  <td>
                    <div className="t-muted-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.description}</div>
                    {r.screenshot_path && (
                      <button className="btn btn-text btn-sm" style={{ padding: 0, marginTop: 4 }} onClick={() => openShot(r)}>
                        <IconPhoto size={14} stroke={1.75} /> 스크린샷 보기
                      </button>
                    )}
                    {r.status === 'in_progress' && (
                      <div className="t-caption" style={{ color: 'var(--success)', marginTop: 4 }}>
                        {r.handler_name} 처리 중 · 시작 {waitLabel(r.started_at, now)} 전
                      </div>
                    )}
                  </td>
                  <td className="tnum" style={{ fontWeight: 600, color: (now - new Date(r.created_at)) > 10 * 60000 ? 'var(--danger)' : 'inherit' }}>
                    {waitLabel(r.created_at, now)}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {r.status === 'waiting' ? (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setStatus(r, 'in_progress')}>
                          <IconPlayerPlay size={14} stroke={1.75} /> 처리 시작
                        </button>
                      ) : (
                        <>
                          <button className="btn btn-white btn-sm" disabled={busy} title="대기로 되돌리기" onClick={() => setStatus(r, 'waiting')}>
                            <IconRotate size={14} stroke={1.75} />
                          </button>
                          <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={busy} onClick={() => setStatus(r, 'resolved')}>
                            <IconCheck size={14} stroke={1.75} /> 해결
                          </button>
                        </>
                      )}
                      <button className="icon-btn danger" title="삭제" disabled={busy} onClick={() => setDeleteTarget(r)}>
                        <IconTrash size={15} stroke={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="chart-panel">
        <button className="row" style={{ gap: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}
          onClick={() => setShowResolved((v) => !v)}>
          <IconCheck size={18} stroke={1.75} color="var(--success)" />
          <h3 className="t-h3">최근 24시간 해결 <span className="t-muted-sm tnum">({resolved.length}건)</span></h3>
          <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>{showResolved ? '접기' : '펼치기'}</span>
        </button>
        {showResolved && (
          <div className="mt-16">
            {resolved.length === 0 ? (
              <div className="t-muted-sm">해결된 요청이 없습니다.</div>
            ) : resolved.map((r) => (
              <div key={r.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                <span className="t-muted-sm row" style={{ gap: 8, overflow: 'hidden', minWidth: 0 }}>
                  <StatusPill kind="done">해결</StatusPill>
                  <span className="t-emph">{r.student_name}</span>
                  <span className="pill pill-neutral">{r.category}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                </span>
                <span className="t-caption muted-soft tnum" style={{ flexShrink: 0 }}>
                  {r.handler_name || '-'} · {fmtDate(r.resolved_at, true)}
                  <button className="icon-btn" title="다시 대기열로" style={{ marginLeft: 4 }} onClick={() => setStatus(r, 'waiting')}>
                    <IconRotate size={14} stroke={1.75} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!shot} title={shot ? `${shot.row.student_name} — 스크린샷` : ''} onClose={() => setShot(null)} wide>
        {shot && <img src={shot.url} alt="학생 스크린샷" style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border)' }} />}
      </Dialog>
      <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="도움 요청 삭제"
        message={`${deleteTarget?.student_name} 학생의 요청을 삭제합니다.`}
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
