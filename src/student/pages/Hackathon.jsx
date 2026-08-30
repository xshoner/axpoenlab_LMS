import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  IconArrowLeft, IconRocket, IconTrash, IconPencil, IconFile, IconDownload,
  IconExternalLink, IconPlus, IconLock, IconBrandGithub,
} from '@tabler/icons-react'
import { UrlHealthBadge, AI_OPTIONS } from '../../shared/urlcheck'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill, StarRating, ConfirmDialog, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, downloadFile, uploadFile, storageSafeName } from '../../lib/helpers'

/* 바이브 해커톤 — 기수별 웹앱 결과물 등록·상호 별점 평가.
   마감(관리자) 후에는 별점 평가만 잠기고, 본인 글 수정·삭제와 열람은 계속 가능하다. */
export default function Hackathon() {
  return (
    <Routes>
      <Route index element={<EntryList />} />
      <Route path="new" element={<EntryForm />} />
      <Route path=":id" element={<EntryDetail />} />
      <Route path=":id/edit" element={<EntryForm />} />
    </Routes>
  )
}

function useRound(cohortId) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!cohortId) return
    supabase.from('hackathon_rounds').select('closed').eq('cohort_id', cohortId).maybeSingle()
      .then(({ data }) => setClosed(!!data?.closed))
  }, [cohortId])
  return closed
}

/* ============ 목록 ============ */
function EntryList() {
  const { profile, cohort } = useAuth()
  const [rows, setRows] = useState(null)
  const [statsMap, setStatsMap] = useState({})
  const closed = useRound(cohort?.id)

  useEffect(() => {
    if (!cohort) { setRows([]); return }
    let alive = true
    ;(async () => {
      const [eQ, sQ] = await Promise.all([
        supabase.from('hackathon_entries').select('*').eq('cohort_id', cohort.id)
          .order('created_at', { ascending: false }),
        supabase.from('hackathon_rating_stats').select('entry_id, avg_rating, rating_count')
          .eq('cohort_id', cohort.id),
      ])
      if (!alive) return
      const map = {}
      for (const s of sQ.data || []) map[s.entry_id] = s
      setStatsMap(map)
      setRows(eQ.data || [])
    })()
    return () => { alive = false }
  }, [cohort])

  if (!cohort) return <EmptyState title="기수에 배정되면 해커톤에 참여할 수 있습니다" description="관리자에게 기수 배정을 문의해 주세요." />
  if (!rows) return <Loading />

  const myEntry = rows.find((r) => r.user_id === profile.id)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div>
          <h2 className="t-h2 row" style={{ gap: 8 }}>
            바이브 해커톤
            {closed && <StatusPill kind="closed">마감</StatusPill>}
          </h2>
          <p className="t-muted-sm">
            {cohort.name} 해커톤 결과물입니다. 동료의 웹앱을 살펴보고 별점으로 응원해 주세요.
            {closed && ' (마감되어 별점 평가는 종료되었습니다)'}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={IconRocket} title="아직 등록된 결과물이 없습니다"
          description="첫 번째 참가자가 되어 보세요!" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>웹앱 제목</th>
                <th style={{ width: 140 }}>소속</th>
                <th style={{ width: 120 }}>이름</th>
                <th style={{ width: 170 }}>평균 별점</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stat = statsMap[r.id]
                const mine = r.user_id === profile.id
                return (
                  <tr key={r.id}>
                    <td>
                      <Link to={r.id} style={{ textDecoration: 'none', color: 'var(--foreground)' }}>
                        {r.title}
                        {mine && <span className="pill pill-neutral" style={{ marginLeft: 6 }}>내 결과물</span>}
                      </Link>
                    </td>
                    <td className="t-muted-sm">{r.author_org || '-'}</td>
                    <td className="t-muted-sm">{r.author_name}</td>
                    <td>
                      {stat
                        ? <StarRating value={stat.avg_rating} size={13} showValue count={stat.rating_count} />
                        : <span className="t-caption muted-soft">아직 평가 없음</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {myEntry ? (
          <Link to={myEntry.id} className="btn btn-white">내 결과물 보기·수정</Link>
        ) : closed ? (
          <span className="t-muted-sm row" style={{ gap: 6 }}><IconLock size={14} stroke={1.75} /> 마감되어 새 참여는 불가합니다</span>
        ) : (
          <Link to="new" className="btn btn-primary sheen">
            <IconRocket size={16} stroke={1.75} /> 해커톤 참여하기
          </Link>
        )}
      </div>
    </div>
  )
}

/* ============ 상세 (별점 평가) ============ */
function EntryDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [entry, setEntry] = useState(null)
  const [stat, setStat] = useState(null)
  const [myRating, setMyRating] = useState(0)
  const [closed, setClosed] = useState(false)
  const [rateBusy, setRateBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function loadStats() {
    const { data } = await supabase.from('hackathon_rating_stats')
      .select('avg_rating, rating_count').eq('entry_id', id).maybeSingle()
    setStat(data || null)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: e } = await supabase.from('hackathon_entries')
        .select('*, hackathon_attachments(*)').eq('id', id).maybeSingle()
      if (!alive) return
      if (!e) { setEntry(false); return }
      setEntry(e)
      const [rQ, roundQ] = await Promise.all([
        supabase.from('hackathon_ratings').select('rating').eq('entry_id', id).eq('user_id', profile.id).maybeSingle(),
        supabase.from('hackathon_rounds').select('closed').eq('cohort_id', e.cohort_id).maybeSingle(),
      ])
      if (!alive) return
      setMyRating(rQ.data?.rating || 0)
      setClosed(!!roundQ.data?.closed)
      loadStats()
    })()
    return () => { alive = false }
  }, [id, profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (entry === null) return <Loading />
  if (entry === false) return <EmptyState title="결과물을 찾을 수 없습니다" action={<Link to="/hackathon" className="btn btn-white btn-sm">목록으로</Link>} />

  const mine = entry.user_id === profile.id

  async function rate(n) {
    if (rateBusy) return
    setRateBusy(true)
    const prev = myRating
    setMyRating(n)
    const { data, error } = await supabase.rpc('rate_hackathon', { p_entry_id: id, p_rating: n })
    setRateBusy(false)
    if (error || !data?.ok) {
      setMyRating(prev)
      toast(data?.error === 'closed' ? '해커톤이 마감되어 평가할 수 없습니다.' : '별점 저장에 실패했습니다.', 'error')
      if (data?.error === 'closed') setClosed(true)
      return
    }
    toast(prev ? '별점이 수정되었습니다.' : '별점이 등록되었습니다!')
    loadStats()
  }

  async function doDelete() {
    setDeleteBusy(true)
    const { error } = await supabase.from('hackathon_entries').delete().eq('id', id)
    setDeleteBusy(false)
    if (error) { toast('삭제에 실패했습니다.', 'error'); setDeleteOpen(false); return }
    toast('결과물이 삭제되었습니다.')
    nav('/hackathon')
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/hackathon')}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>

      <div className="card-panel">
        <div className="row-between mb-8">
          <h2 className="t-h2 row" style={{ gap: 8 }}>
            {entry.title}
            {closed && <StatusPill kind="closed">마감</StatusPill>}
          </h2>
          {mine && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-white btn-sm" onClick={() => nav(`/hackathon/${id}/edit`)}>
                <IconPencil size={14} stroke={1.75} /> 수정
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                <IconTrash size={14} stroke={1.75} /> 삭제
              </button>
            </div>
          )}
        </div>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(entry.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{entry.author_name}</span>
          {entry.author_org && <span className="t-caption muted-soft">{entry.author_org}</span>}
          <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(entry.created_at, true)}</span>
        </div>

        {entry.url && (
          <a href={entry.url} target="_blank" rel="noreferrer" className="btn btn-primary mb-16" style={{ alignSelf: 'flex-start' }}>
            <IconExternalLink size={16} stroke={1.75} /> 웹앱 열어 보기
          </a>
        )}
        {entry.summary && <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{entry.summary}</p>}

        {(entry.main_ai || entry.prompt_text || entry.repo_url) && (
          <div className="mt-16 stack" style={{ gap: 10 }}>
            {entry.main_ai && (
              <div className="row" style={{ gap: 8 }}>
                <span className="t-label" style={{ width: 120, flexShrink: 0 }}>주로 사용한 AI</span>
                <span className="pill pill-neutral">{entry.main_ai}</span>
              </div>
            )}
            {entry.repo_url && (
              <div className="row" style={{ gap: 8 }}>
                <span className="t-label" style={{ width: 120, flexShrink: 0 }}>Github Repo.</span>
                <a href={entry.repo_url} target="_blank" rel="noreferrer" className="row t-muted-sm" style={{ gap: 4, overflow: 'hidden' }}>
                  <IconBrandGithub size={14} stroke={1.75} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.repo_url}</span>
                </a>
              </div>
            )}
            {entry.prompt_text && (
              <div>
                <div className="t-label mb-8">입력한 프롬프트 내용</div>
                <pre className="prompt-box">{entry.prompt_text}</pre>
              </div>
            )}
          </div>
        )}

        {(entry.hackathon_attachments || []).length > 0 && (
          <div className="mt-16">
            <h3 className="t-h3 mb-8">첨부파일</h3>
            {entry.hackathon_attachments.map((a) => (
              <div key={a.id} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn" aria-label={`${a.filename} 다운로드`}
                  onClick={() => downloadFile('hackathon-files', a.file_path, a.filename).catch(() => toast('다운로드에 실패했습니다.', 'error'))}>
                  <IconDownload size={16} stroke={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-panel" style={{ textAlign: 'center' }}>
        {mine ? (
          <>
            <h3 className="t-h3 mb-8">동료들의 평가</h3>
            {stat && stat.rating_count > 0 ? (
              <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                <StarRating value={stat.avg_rating} size={22} showValue count={stat.rating_count} />
              </div>
            ) : (
              <p className="t-muted-sm">아직 받은 평가가 없습니다.</p>
            )}
          </>
        ) : closed ? (
          <>
            <h3 className="t-h3 mb-8">최종 평가</h3>
            {stat && stat.rating_count > 0 ? (
              <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                <StarRating value={stat.avg_rating} size={22} showValue count={stat.rating_count} />
              </div>
            ) : (
              <p className="t-muted-sm">받은 평가가 없습니다.</p>
            )}
            <p className="t-caption muted-soft mt-8">해커톤이 마감되어 별점 평가가 종료되었습니다.</p>
          </>
        ) : (
          <>
            <h3 className="t-h3 mb-8">이 결과물은 어떠셨나요?</h3>
            <p className="t-muted-sm mb-16">별점을 눌러 평가해 주세요. 언제든 수정할 수 있습니다.</p>
            <StarRating value={myRating} onChange={rate} size={32} />
            <div className="t-caption muted-soft mt-8">
              {myRating > 0 ? `내 평가: ${myRating}점` : '아직 평가하지 않았습니다'}
              {stat && stat.rating_count > 0 && (
                <> · 평균 {Number(stat.avg_rating).toFixed(1)}점 ({stat.rating_count}명 참여)</>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog open={deleteOpen} danger busy={deleteBusy}
        title="결과물 삭제"
        message="결과물과 받은 별점이 모두 삭제됩니다. 계속할까요?"
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}

/* ============ 등록/수정 폼 ============ */
function EntryForm() {
  const { id } = useParams() // 있으면 수정 모드
  const { profile, cohort } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ title: '', summary: '', url: '', main_ai: '', prompt_text: '', repo_url: '' })
  const [attachments, setAttachments] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(!!id)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    supabase.from('hackathon_entries').select('*, hackathon_attachments(*)').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (!data || data.user_id !== profile.id) { nav('/hackathon'); return }
        setForm({
          title: data.title, summary: data.summary || '', url: data.url || '',
          main_ai: data.main_ai || '', prompt_text: data.prompt_text || '', repo_url: data.repo_url || '',
        })
        setAttachments(data.hackathon_attachments || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [id, profile.id, nav])

  if (!cohort) return <EmptyState title="기수에 배정되면 해커톤에 참여할 수 있습니다" />
  if (loading) return <Loading />

  function addPending(file) {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast('첨부는 파일당 최대 50MB입니다.', 'error'); return }
    setPending((p) => [...p, file])
  }

  async function removeAttachment(att) {
    const { error } = await supabase.from('hackathon_attachments').delete().eq('id', att.id)
    if (error) { toast('첨부 삭제에 실패했습니다.', 'error'); return }
    setAttachments((a) => a.filter((x) => x.id !== att.id))
  }

  async function save() {
    const title = form.title.trim()
    const url = form.url.trim()
    if (!title) { toast('웹앱 제목을 입력해 주세요.', 'error'); return }
    if (url && !/^https?:\/\/.+/.test(url)) { toast('URL은 http:// 또는 https:// 로 시작해야 합니다.', 'error'); return }
    const repoUrl = form.repo_url.trim()
    if (repoUrl && !/^https?:\/\/.+/.test(repoUrl)) { toast('Github Repo 주소는 http:// 또는 https:// 로 시작해야 합니다.', 'error'); return }
    if (!url && attachments.length === 0 && pending.length === 0) {
      toast('URL 또는 파일 중 최소 하나는 제출해야 합니다.', 'error')
      return
    }
    setBusy(true)
    try {
      const base = {
        title, summary: form.summary.trim(), url: url || null,
        main_ai: form.main_ai, prompt_text: form.prompt_text.trim(), repo_url: repoUrl || null,
        author_name: profile.nickname || profile.name,
        author_org: profile.org || '',
      }
      let entryId = id
      if (entryId) {
        const { error } = await supabase.from('hackathon_entries')
          .update({ ...base, updated_at: new Date().toISOString() }).eq('id', entryId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('hackathon_entries')
          .insert({ ...base, cohort_id: cohort.id, user_id: profile.id }).select('id').single()
        if (error) throw error
        entryId = data.id
      }
      for (const file of pending) {
        const path = `${profile.id}/${entryId}/${storageSafeName(file.name)}`
        await uploadFile('hackathon-files', path, file)
        const { error } = await supabase.from('hackathon_attachments')
          .insert({ entry_id: entryId, file_path: path, filename: file.name, file_size: file.size })
        if (error) throw error
      }
      toast(id ? '결과물이 수정되었습니다.' : '해커톤 참여가 등록되었습니다!')
      nav('/hackathon')
    } catch (e) {
      const dup = String(e?.message || '').includes('duplicate') || e?.code === '23505'
      toast(dup ? '이미 등록한 결과물이 있습니다. 목록에서 수정해 주세요.' : `저장에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <div className="row-between">
        <h2 className="t-h2">{id ? '결과물 수정' : '해커톤 참여하기'}</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={() => nav('/hackathon')}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            {busy ? '저장 중…' : id ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>

      <div className="card-panel">
        <div className="field">
          <label>웹앱 제목 <span className="req">*</span></label>
          <input className="input" maxLength={100} value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label>주요 내용 요약</label>
          <textarea className="textarea" maxLength={2000} style={{ minHeight: 120 }}
            placeholder="어떤 문제를 해결하는 웹앱인지, 핵심 기능은 무엇인지 소개해 주세요."
            value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="field">
          <label>주로 사용한 AI</label>
          <select className="select" value={form.main_ai} onChange={(e) => setForm({ ...form, main_ai: e.target.value })}>
            <option value="">선택하세요</option>
            {AI_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="field">
          <label>입력한 프롬프트 내용 <span className="t-caption muted-soft">(선택)</span></label>
          <textarea className="textarea" maxLength={5000} style={{ minHeight: 120 }}
            placeholder="웹앱을 만들 때 AI에 입력한 주요 프롬프트를 붙여 넣어 주세요."
            value={form.prompt_text} onChange={(e) => setForm({ ...form, prompt_text: e.target.value })} />
        </div>
        <div className="field">
          <label>Github Repo. <span className="t-caption muted-soft">(선택)</span></label>
          <input className="input" placeholder="https://github.com/사용자/저장소" value={form.repo_url}
            onChange={(e) => setForm({ ...form, repo_url: e.target.value })} />
        </div>
        <div className="field">
          <label>웹앱 URL</label>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="https://..." value={form.url} style={{ flex: 1 }}
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <UrlHealthBadge url={form.url} />
          </div>
          <span className="hint">배포된 웹앱 주소를 입력하세요. URL 또는 파일 중 최소 하나는 필요합니다. 입력하면 연결 상태를 자동으로 확인합니다.</span>
        </div>
      </div>

      <div className="card-panel">
        <div className="row-between mb-16">
          <h3 className="t-h3">파일 첨부 <span className="t-caption muted-soft">(선택 · 파일당 최대 50MB)</span></h3>
          <button className="btn btn-white btn-sm" onClick={() => fileInput.current?.click()}>
            <IconPlus size={14} stroke={1.75} /> 파일 추가
          </button>
          <input ref={fileInput} type="file" hidden
            onChange={(e) => { addPending(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {attachments.length === 0 && pending.length === 0 ? (
          <p className="t-muted-sm">소스 압축본, 발표 자료, 스크린샷 등을 첨부할 수 있습니다.</p>
        ) : (
          <>
            {attachments.map((a) => (
              <div key={a.id} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn danger" onClick={() => removeAttachment(a)}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </div>
            ))}
            {pending.map((f, i) => (
              <div key={`p-${i}`} className="attachment-row" style={{ background: 'var(--primary-tint)' }}>
                <IconFile size={18} stroke={1.75} color="var(--primary)" />
                <span>{f.name}</span>
                <span className="pill pill-neutral">저장 시 업로드</span>
                <span className="size">{fmtBytes(f.size)}</span>
                <button className="icon-btn danger" onClick={() => setPending((p) => p.filter((_, x) => x !== i))}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
