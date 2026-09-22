import { useEffect, useRef, useState } from 'react'
import { IconTrash, IconTrophy, IconFlagCheck, IconListNumbers, IconLockOpen, IconRefresh } from '@tabler/icons-react'
import { useUrlStatuses, UrlStatusDot } from '../../shared/urlcheck'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useCohort } from '../cohortContext'
import { HackathonEntryView } from '../../shared/hackathonEntry'
import { ConfirmDialog, EmptyState, Loading, Pagination, StatusPill, StarRating, useToast } from '../../shared/ui'
import { fmtDate } from '../../lib/helpers'

const PAGE_SIZE = 20
const RANK_LABEL = { 1: '🥇 TOP 1', 2: '🥈 TOP 2', 3: '🥉 TOP 3' }

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/* 해커톤 관리 — 전체/기수별 결과물, 마감 처리, 최종 순위표, 전 기수 명예의 전당 관리 */
export default function HackathonAdmin() {
  const { cohorts, selectedId, selected } = useCohort()
  const { profile } = useAuth()
  const toast = useToast()
  const [view, setView] = useState('entries') // entries | hall
  const [rows, setRows] = useState([])
  const [statsMap, setStatsMap] = useState({})
  const [round, setRound] = useState(null)
  const [hall, setHall] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // entry row | { hall: row }
  const [busy, setBusy] = useState(false)
  const loadToken = useRef(0)
  const urlStatus = useUrlStatuses(view === 'entries' ? rows.map((row) => row.url) : [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return
      setOpenId(null)
      setPage(1)
    })
    return () => { active = false }
  }, [selectedId])

  async function load() {
    const token = ++loadToken.current
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    setLoading(true)

    if (view === 'hall') {
      const { data, count, error } = await supabase.from('hall_of_fame').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).order('rank').range(from, to)
      if (token !== loadToken.current) return
      if (error) toast('명예의 전당을 불러오지 못했습니다.', 'error')
      setHall(data || [])
      setTotal(count || 0)
      setLoading(false)
      return
    }

    let entriesQuery = supabase.from('hackathon_entries')
      .select('*, hackathon_attachments(*)', { count: 'exact' })
      .order('created_at', { ascending: false }).range(from, to)
    if (selectedId) entriesQuery = entriesQuery.eq('cohort_id', selectedId)

    const roundQuery = selectedId
      ? supabase.from('hackathon_rounds').select('*').eq('cohort_id', selectedId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
    const [entriesResult, roundResult] = await Promise.all([entriesQuery, roundQuery])
    if (token !== loadToken.current) return

    const nextRows = entriesResult.data || []
    const ids = nextRows.map((row) => row.id)
    const statsResult = ids.length
      ? await supabase.from('hackathon_rating_stats').select('entry_id, avg_rating, rating_count').in('entry_id', ids)
      : { data: [] }
    if (token !== loadToken.current) return

    const map = {}
    for (const stat of statsResult.data || []) map[stat.entry_id] = stat
    if (entriesResult.error || roundResult.error || statsResult.error) toast('해커톤 결과물을 불러오지 못했습니다.', 'error')
    setRows(nextRows)
    setStatsMap(map)
    setRound(roundResult.data || null)
    setTotal(entriesResult.count || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [selectedId, view, page])

  const closed = !!round?.closed
  const cohortName = (id) => cohorts.find((cohort) => cohort.id === id)?.name || '-'

  // 선택 기수의 전체 결과물을 별점순으로 정렬해 새 창에 표시한다.
  async function openRanking(targetWindow = null) {
    if (!selectedId) return
    const win = targetWindow || window.open('', '_blank', 'width=760,height=900')
    if (!win) { toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'error'); return }
    const [entriesResult, statsResult] = await Promise.all([
      supabase.from('hackathon_entries').select('*').eq('cohort_id', selectedId).order('created_at'),
      supabase.from('hackathon_rating_stats').select('entry_id, avg_rating, rating_count').eq('cohort_id', selectedId),
    ])
    if (entriesResult.error || statsResult.error) {
      win.close()
      toast('순위표를 불러오지 못했습니다.', 'error')
      return
    }
    const allStats = {}
    for (const stat of statsResult.data || []) allStats[stat.entry_id] = stat
    const ranked = [...(entriesResult.data || [])].sort((a, b) => {
      const sa = allStats[a.id], sb = allStats[b.id]
      if (!sa && !sb) return new Date(a.created_at) - new Date(b.created_at)
      if (!sa) return 1
      if (!sb) return -1
      return Number(sb.avg_rating) - Number(sa.avg_rating)
        || sb.rating_count - sa.rating_count
        || new Date(a.created_at) - new Date(b.created_at)
    })
    const trs = ranked.map((row, index) => {
      const stat = allStats[row.id]
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`
      return `<tr class="${index < 3 && stat ? 'top' : ''}">
        <td class="rank">${stat ? medal : '-'}</td>
        <td class="title">${esc(row.title)}</td>
        <td>${esc(row.author_org || '-')}</td>
        <td>${esc(row.author_name)}</td>
        <td class="num">${stat ? `★ ${Number(stat.avg_rating).toFixed(2)}` : '평가 없음'}</td>
        <td class="num">${stat ? `${stat.rating_count}명` : '-'}</td>
      </tr>`
    }).join('')
    win.document.write(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>바이브 해커톤 최종 순위 — ${esc(selected?.name || '')}</title>
<style>
  body { margin: 0; padding: 32px 24px; background: #fff; color: #1a1a1a;
         font-family: Pretendard, -apple-system, 'Malgun Gothic', sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
  th { color: #888; font-weight: 600; font-size: 12px; }
  .rank { font-size: 18px; width: 48px; text-align: center; }
  .title { font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  tr.top td { background: #FFFBEB; }
  @media print { body { padding: 12px; } }
</style></head>
<body>
  <h1>🏆 바이브 해커톤 최종 순위</h1>
  <div class="sub">${esc(selected?.name || '')} · ${closed ? `마감 ${esc(fmtDate(round?.closed_at, true))}` : '진행 중 (참고용 현재 순위)'} · 총 ${ranked.length}개 결과물</div>
  <table>
    <thead><tr><th class="rank">순위</th><th>웹앱 제목</th><th>소속</th><th>이름</th><th class="num">평균 별점</th><th class="num">참여</th></tr></thead>
    <tbody>${trs}</tbody>
  </table>
</body></html>`)
    win.document.close()
  }

  async function doClose() {
    const rankingWindow = window.open('', '_blank', 'width=760,height=900')
    setBusy(true)
    const { data, error } = await supabase.rpc('close_hackathon', { p_cohort_id: selectedId })
    setBusy(false)
    setCloseOpen(false)
    if (error || !data?.ok) {
      rankingWindow?.close()
      toast('마감 처리에 실패했습니다.', 'error')
      return
    }
    toast(`해커톤이 마감되었습니다. TOP ${data.top_count}개 결과물이 명예의 전당에 등재되었습니다.`)
    await load()
    if (rankingWindow) await openRanking(rankingWindow)
  }

  async function doReopen() {
    setBusy(true)
    const { data, error } = await supabase.rpc('reopen_hackathon', { p_cohort_id: selectedId })
    setBusy(false)
    setReopenOpen(false)
    if (error || !data?.ok) { toast('마감 해제에 실패했습니다.', 'error'); return }
    toast('마감이 해제되었습니다. 명예의 전당 등재도 회수되었습니다.')
    load()
  }

  async function doDelete() {
    setBusy(true)
    try {
      if (deleteTarget.hall) {
        const { error } = await supabase.from('hall_of_fame').delete().eq('id', deleteTarget.hall.id)
        if (error) throw error
        toast('명예의 전당 기록이 삭제되었습니다.')
      } else {
        const { error } = await supabase.from('hackathon_entries').delete().eq('id', deleteTarget.id)
        if (error) throw error
        toast('결과물이 삭제되었습니다.')
        if (openId === deleteTarget.id) setOpenId(null)
      }
      setDeleteTarget(null)
      const pageRows = view === 'hall' ? hall : rows
      if (page > 1 && pageRows.length === 1) setPage((currentPage) => currentPage - 1)
      else load()
    } catch {
      toast('삭제에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />

  const currentIdx = rows.findIndex((row) => row.id === openId)
  const current = view === 'entries' && currentIdx >= 0 ? rows[currentIdx] : null
  if (current) {
    const prevEntry = currentIdx > 0 ? rows[currentIdx - 1] : null
    const nextEntry = currentIdx < rows.length - 1 ? rows[currentIdx + 1] : null
    return (
      <>
        <HackathonEntryView key={current.id} entry={current} profile={profile} isAdmin
          onBack={() => { setOpenId(null); load() }}
          onPrev={prevEntry ? () => setOpenId(prevEntry.id) : null}
          onNext={nextEntry ? () => setOpenId(nextEntry.id) : null}
          onDelete={() => setDeleteTarget(current)} />
        <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="결과물 삭제"
          message={`'${deleteTarget?.title}' 결과물과 받은 별점·평가 의견이 모두 삭제됩니다.`}
          confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
      </>
    )
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <h2 className="t-h2 row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {view === 'hall' ? '명예의 전당' : '해커톤 관리'}
          <span className="t-muted-sm tnum">
            ({view === 'hall' ? '전체 기수 · TOP 3' : selected?.name || '전체 기수'} · 총 {total}건)
          </span>
          {view === 'entries' && selectedId && closed && <StatusPill kind="closed">마감됨</StatusPill>}
        </h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${view === 'hall' ? 'btn-primary' : 'btn-white'}`}
            onClick={() => { setOpenId(null); setPage(1); setView(view === 'hall' ? 'entries' : 'hall') }}>
            {view === 'hall'
              ? <><IconListNumbers size={14} stroke={1.75} /> 결과물 목록</>
              : <><IconTrophy size={14} stroke={1.75} /> 명예의 전당</>}
          </button>
          {view === 'entries' && (
            <button className="btn btn-white btn-sm" onClick={urlStatus.recheck}
              disabled={urlStatus.checking || urlStatus.total === 0}
              title="현재 페이지의 웹앱 URL이 모두 연결되는지 다시 확인합니다">
              <IconRefresh size={14} stroke={1.75} className={urlStatus.checking ? 'spin' : ''} />
              {urlStatus.checking ? 'URL 검사 중…' : '현재 페이지 URL 검사'}
            </button>
          )}
          {view === 'entries' && selectedId && (
            <>
              <button className="btn btn-white btn-sm" onClick={() => openRanking()}>
                <IconListNumbers size={14} stroke={1.75} /> {closed ? '최종 순위표 보기' : '현재 순위표 보기'}
              </button>
              {closed ? (
                <button className="btn btn-white btn-sm" onClick={() => setReopenOpen(true)}>
                  <IconLockOpen size={14} stroke={1.75} /> 마감 해제
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setCloseOpen(true)}>
                  <IconFlagCheck size={14} stroke={1.75} /> 해커톤 마감
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {view === 'entries' && rows.length > 0 && urlStatus.total > 0 && (
        <div className="url-summary">
          <span className="url-summary-item ok"><span className="dot" /> {urlStatus.ok}개 정상</span>
          <span className="url-summary-item bad"><span className="dot" /> {urlStatus.bad}개 오류</span>
          {urlStatus.pending > 0 && <span className="url-summary-item"><span className="dot" /> {urlStatus.pending}개 확인 중</span>}
          <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>
            현재 페이지 · URL 미등록 {rows.length - urlStatus.total}건{urlStatus.checkedAt ? ` · 마지막 검사 ${new Date(urlStatus.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      )}

      {view === 'entries' ? (
        rows.length === 0 ? (
          <EmptyState title="등록된 결과물이 없습니다" description="학생들이 '바이브 해커톤' 메뉴에서 결과물을 등록하면 여기에 표시됩니다." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>웹앱 제목</th><th style={{ width: 110 }}>기수</th><th>소속</th><th>이름</th>
                  <th style={{ width: 110 }}>URL 연결</th><th style={{ width: 170 }}>평균 별점</th>
                  <th style={{ width: 130 }}>등록일</th><th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const stat = statsMap[row.id]
                  return (
                    <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(row.id)}>
                      <td className="t-emph">{row.title}</td>
                      <td className="t-muted-sm">{cohortName(row.cohort_id)}</td>
                      <td className="t-muted-sm">{row.author_org || '-'}</td>
                      <td className="t-muted-sm">{row.author_name}</td>
                      <td onClick={(event) => event.stopPropagation()}><UrlStatusDot url={row.url} state={urlStatus.map[row.url]} link /></td>
                      <td>
                        {stat
                          ? <StarRating value={stat.avg_rating} size={13} showValue count={stat.rating_count} />
                          : <span className="t-caption muted-soft">평가 없음</span>}
                      </td>
                      <td className="tnum">{fmtDate(row.created_at)}</td>
                      <td>
                        <button className="icon-btn danger" title="삭제"
                          onClick={(event) => { event.stopPropagation(); setDeleteTarget(row) }}>
                          <IconTrash size={16} stroke={1.75} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        hall.length === 0 ? (
          <EmptyState icon={IconTrophy} title="아직 등재된 기록이 없습니다"
            description="각 기수 해커톤을 마감하면 별점 상위 TOP 3가 자동으로 등재됩니다." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>웹앱 제목</th><th style={{ width: 120 }}>기수</th><th style={{ width: 120 }}>순위</th>
                  <th>소속</th><th>이름</th><th style={{ width: 170 }}>최종 별점</th>
                  <th style={{ width: 130 }}>등재일</th><th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {hall.map((row) => (
                  <tr key={row.id}>
                    <td className="t-emph">
                      {row.url ? <a href={row.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{row.title}</a> : row.title}
                    </td>
                    <td className="t-muted-sm">{row.cohort_name || cohortName(row.cohort_id)}</td>
                    <td><span style={{ fontWeight: 700 }}>{RANK_LABEL[row.rank] || `TOP ${row.rank}`}</span></td>
                    <td className="t-muted-sm">{row.author_org || '-'}</td>
                    <td className="t-muted-sm">{row.author_name}</td>
                    <td><StarRating value={row.avg_rating} size={13} showValue count={row.rating_count} /></td>
                    <td className="tnum">{fmtDate(row.created_at)}</td>
                    <td>
                      <button className="icon-btn danger" title="등재 삭제" onClick={() => setDeleteTarget({ hall: row })}>
                        <IconTrash size={16} stroke={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      <ConfirmDialog open={closeOpen} busy={busy} title="해커톤 마감"
        message={`${selected?.name} 해커톤을 마감합니다. 학생 별점 평가가 중단되고, 별점 상위 TOP 3가 명예의 전당에 자동 등재됩니다. (본인 글 수정·열람은 계속 가능)`}
        confirmLabel="마감하기" onConfirm={doClose} onClose={() => setCloseOpen(false)} />
      <ConfirmDialog open={reopenOpen} danger busy={busy} title="마감 해제"
        message="마감을 해제하면 별점 평가가 다시 열리고, 이 기수의 명예의 전당 등재가 회수됩니다. 계속할까요?"
        confirmLabel="마감 해제" onConfirm={doReopen} onClose={() => setReopenOpen(false)} />
      <ConfirmDialog open={!!deleteTarget} danger busy={busy}
        title={deleteTarget?.hall ? '명예의 전당 기록 삭제' : '결과물 삭제'}
        message={deleteTarget?.hall
          ? `'${deleteTarget.hall.title}' 등재 기록을 삭제합니다.`
          : `'${deleteTarget?.title}' 결과물과 받은 별점이 모두 삭제됩니다.`}
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
