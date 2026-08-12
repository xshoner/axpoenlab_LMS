import { useEffect, useState } from 'react'
import {
  IconArrowLeft, IconTrash, IconTrophy, IconFlagCheck, IconListNumbers,
  IconLockOpen, IconFile, IconDownload, IconExternalLink,
} from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, EmptyState, Loading, StatusPill, StarRating, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, downloadFile } from '../../lib/helpers'

const RANK_LABEL = { 1: '🥇 TOP 1', 2: '🥈 TOP 2', 3: '🥉 TOP 3' }

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/* 해커톤 관리 — 기수별 결과물 전체 열람·수정·삭제, 마감 처리, 최종 순위표, 명예의 전당 관리 */
export default function HackathonAdmin() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [statsMap, setStatsMap] = useState({})
  const [round, setRound] = useState(null)
  const [hall, setHall] = useState([])
  const [openId, setOpenId] = useState(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // entry row | { hall: row }
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedId) { setRows([]); return }
    const [eQ, sQ, rQ, hQ] = await Promise.all([
      supabase.from('hackathon_entries').select('*, hackathon_attachments(*)')
        .eq('cohort_id', selectedId).order('created_at', { ascending: false }),
      supabase.from('hackathon_rating_stats').select('entry_id, avg_rating, rating_count').eq('cohort_id', selectedId),
      supabase.from('hackathon_rounds').select('*').eq('cohort_id', selectedId).maybeSingle(),
      supabase.from('hall_of_fame').select('*').eq('cohort_id', selectedId).order('rank'),
    ])
    const map = {}
    for (const s of sQ.data || []) map[s.entry_id] = s
    setStatsMap(map)
    setRows(eQ.data || [])
    setRound(rQ.data || null)
    setHall(hQ.data || [])
  }
  useEffect(() => { setOpenId(null); load() }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedId) return <EmptyState title="기수를 선택해 주세요" description="상단의 기수 선택 드롭다운에서 기수를 선택하면 해당 기수의 해커톤이 표시됩니다." />
  if (!rows) return <Loading />

  const closed = !!round?.closed

  // 별점순 정렬 (평가 없는 항목은 뒤로)
  function rankedRows() {
    return [...rows].sort((a, b) => {
      const sa = statsMap[a.id], sb = statsMap[b.id]
      if (!sa && !sb) return new Date(a.created_at) - new Date(b.created_at)
      if (!sa) return 1
      if (!sb) return -1
      return Number(sb.avg_rating) - Number(sa.avg_rating)
        || sb.rating_count - sa.rating_count
        || new Date(a.created_at) - new Date(b.created_at)
    })
  }

  // 최종 순위표를 새 창으로 표시
  function openRanking() {
    const ranked = rankedRows()
    const win = window.open('', '_blank', 'width=760,height=900')
    if (!win) { toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'error'); return }
    const trs = ranked.map((r, i) => {
      const stat = statsMap[r.id]
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
      return `<tr class="${i < 3 && stat ? 'top' : ''}">
        <td class="rank">${stat ? medal : '-'}</td>
        <td class="title">${esc(r.title)}</td>
        <td>${esc(r.author_org || '-')}</td>
        <td>${esc(r.author_name)}</td>
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
    setBusy(true)
    const { data, error } = await supabase.rpc('close_hackathon', { p_cohort_id: selectedId })
    setBusy(false)
    setCloseOpen(false)
    if (error || !data?.ok) { toast('마감 처리에 실패했습니다.', 'error'); return }
    toast(`해커톤이 마감되었습니다. TOP ${data.top_count}개 결과물이 명예의 전당에 등재되었습니다.`)
    await load()
    openRanking()
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
      load()
    } catch {
      toast('삭제에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  const current = rows.find((r) => r.id === openId)
  if (current) {
    return <EntryEditor entry={current} stat={statsMap[current.id]}
      onBack={() => setOpenId(null)} onSaved={() => { setOpenId(null); load() }}
      onDelete={() => setDeleteTarget(current)}
      deleteDialog={
        <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="결과물 삭제"
          message={`'${deleteTarget?.title}' 결과물과 받은 별점이 모두 삭제됩니다.`}
          confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
      } />
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between">
        <h2 className="t-h2 row" style={{ gap: 8 }}>
          해커톤 관리 <span className="t-muted-sm tnum">({selected?.name} · 전체 {rows.length}건)</span>
          {closed && <StatusPill kind="closed">마감됨</StatusPill>}
        </h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={openRanking}>
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
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="등록된 결과물이 없습니다" description="학생들이 '바이브 해커톤' 메뉴에서 결과물을 등록하면 여기에 표시됩니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>웹앱 제목</th><th>소속</th><th>이름</th><th style={{ width: 170 }}>평균 별점</th>
                <th style={{ width: 130 }}>등록일</th><th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stat = statsMap[r.id]
                return (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                    <td className="t-emph">{r.title}</td>
                    <td className="t-muted-sm">{r.author_org || '-'}</td>
                    <td className="t-muted-sm">{r.author_name}</td>
                    <td>
                      {stat
                        ? <StarRating value={stat.avg_rating} size={13} showValue count={stat.rating_count} />
                        : <span className="t-caption muted-soft">평가 없음</span>}
                    </td>
                    <td className="tnum">{fmtDate(r.created_at)}</td>
                    <td>
                      <button className="icon-btn danger" title="삭제"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(r) }}>
                        <IconTrash size={16} stroke={1.75} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="chart-panel">
        <div className="row mb-16" style={{ gap: 8 }}>
          <IconTrophy size={18} stroke={1.75} color="var(--accent-deep)" />
          <h3 className="t-h3">명예의 전당 — {selected?.name}</h3>
          <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>마감 시 TOP 3가 자동 등재됩니다</span>
        </div>
        {hall.length === 0 ? (
          <div className="t-muted-sm">등재된 기록이 없습니다.</div>
        ) : hall.map((h) => (
          <div key={h.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="t-muted-sm row" style={{ gap: 8, overflow: 'hidden' }}>
              <span style={{ fontWeight: 700 }}>{RANK_LABEL[h.rank]}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
              <span className="muted-soft">— {h.author_org ? `${h.author_org} · ` : ''}{h.author_name} · ★ {Number(h.avg_rating).toFixed(1)} ({h.rating_count}명)</span>
            </span>
            <button className="icon-btn danger" title="등재 삭제" onClick={() => setDeleteTarget({ hall: h })}>
              <IconTrash size={16} stroke={1.75} />
            </button>
          </div>
        ))}
      </section>

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

/* ============ 결과물 상세·수정 (관리자) ============ */
function EntryEditor({ entry, stat, onBack, onSaved, onDelete, deleteDialog }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: entry.title, summary: entry.summary || '', url: entry.url || '' })
  const [attachments, setAttachments] = useState(entry.hackathon_attachments || [])
  const [busy, setBusy] = useState(false)

  async function save() {
    const title = form.title.trim()
    const url = form.url.trim()
    if (!title) { toast('제목을 입력해 주세요.', 'error'); return }
    if (url && !/^https?:\/\/.+/.test(url)) { toast('URL 형식을 확인해 주세요.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('hackathon_entries')
      .update({ title, summary: form.summary.trim(), url: url || null, updated_at: new Date().toISOString() })
      .eq('id', entry.id)
    setBusy(false)
    if (error) { toast('저장에 실패했습니다.', 'error'); return }
    toast('저장되었습니다.')
    onSaved()
  }

  async function removeAttachment(att) {
    const { error } = await supabase.from('hackathon_attachments').delete().eq('id', att.id)
    if (error) { toast('첨부 삭제에 실패했습니다.', 'error'); return }
    setAttachments((a) => a.filter((x) => x.id !== att.id))
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <div className="row-between">
        <button className="btn btn-text" onClick={onBack}>
          <IconArrowLeft size={14} stroke={1.75} /> 목록으로
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            <IconTrash size={14} stroke={1.75} /> 삭제
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      <div className="card-panel">
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(entry.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{entry.author_name}</span>
          {entry.author_org && <span className="t-caption muted-soft">{entry.author_org}</span>}
          <span style={{ marginLeft: 'auto' }}>
            {stat
              ? <StarRating value={stat.avg_rating} size={14} showValue count={stat.rating_count} />
              : <span className="t-caption muted-soft">평가 없음</span>}
          </span>
        </div>
        <div className="field">
          <label>웹앱 제목</label>
          <input className="input" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label>주요 내용 요약</label>
          <textarea className="textarea" maxLength={2000} style={{ minHeight: 120 }}
            value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="field">
          <label>웹앱 URL</label>
          <input className="input" placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </div>
        {form.url && /^https?:\/\/.+/.test(form.url.trim()) && (
          <a href={form.url.trim()} target="_blank" rel="noreferrer" className="row t-muted-sm" style={{ gap: 6 }}>
            <IconExternalLink size={14} stroke={1.75} /> 새 창에서 열어 보기
          </a>
        )}
      </div>

      <div className="card-panel">
        <h3 className="t-h3 mb-16">첨부파일</h3>
        {attachments.length === 0 ? (
          <p className="t-muted-sm">첨부파일이 없습니다.</p>
        ) : attachments.map((a) => (
          <div key={a.id} className="attachment-row">
            <IconFile size={18} stroke={1.75} color="var(--muted)" />
            <span>{a.filename}</span>
            <span className="size">{fmtBytes(a.file_size)}</span>
            <button className="icon-btn" onClick={() => downloadFile('hackathon-files', a.file_path, a.filename).catch(() => toast('다운로드에 실패했습니다.', 'error'))}>
              <IconDownload size={16} stroke={1.75} />
            </button>
            <button className="icon-btn danger" onClick={() => removeAttachment(a)}>
              <IconTrash size={16} stroke={1.75} />
            </button>
          </div>
        ))}
      </div>
      {deleteDialog}
    </div>
  )
}
