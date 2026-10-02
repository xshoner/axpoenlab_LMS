import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { IconPin, IconNotes, IconSpeakerphone, IconTrash, IconMessages } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { useCohort } from '../cohortContext'
import { Loading, EmptyState, StatCard, StarRating, useToast } from '../../shared/ui'
import { fmtDate, pad2 } from '../../lib/helpers'
import { AiBookmarks } from '../../shared/bookmarks'

export default function AdminDashboard() {
  const { cohorts, selectedId, selected } = useCohort()
  const { profile } = useAuth()
  const [loadError, setLoadError] = useState(false)
  const [global_, setGlobal] = useState(null)
  const [cohortStats, setCohortStats] = useState(null)
  const [courseGroupId, setCourseGroupId] = useState('')
  const [visitRange, setVisitRange] = useState('month') // 'month': 최근 30일(일별) | 'year': 최근 1년(월별)

  // One RLS-protected snapshot; cohort metadata loading must not refetch it.
  useEffect(() => {
    let alive = true
    setGlobal(null)
    setLoadError(false)
    supabase.rpc('admin_dashboard_overview').then(({ data, error }) => {
      if (!alive) return
      if (error) { setLoadError(true); return }
      setGlobal(data)
    })
    return () => { alive = false }
  }, [profile.id])

  const perCohort = useMemo(() => {
    const counts = new Map((global_?.memberCounts || []).map((m) => [m.cohort_id, Number(m.count)]))
    return cohorts.map((c) => ({ name: c.name, 학생수: counts.get(c.id) || 0 }))
  }, [cohorts, global_])

  // 선택 기수 통계
  useEffect(() => {
    if (!selectedId) { setCohortStats(null); return }
    let alive = true
    ;(async () => {
      setCohortStats(undefined)
      const { data, error } = await supabase.rpc('admin_cohort_metrics', { p_cohort: selectedId })
      if (!alive) return
      if (error || !data) { setLoadError(true); return }
      const groups = data.courseGroups
      const defaultCourseGroupId = groups.find(g => g.is_default)?.id || groups[0]?.id || ''
      setCourseGroupId(current => groups.some(g => g.id === current) ? current : defaultCourseGroupId)
      setCohortStats({ ...data, defaultCourseGroupId })
    })()
    return () => { alive = false }
  }, [selectedId])

  // 방문 추이: 최근 30일은 일별, 최근 1년은 월별로 집계해 표시
  const visitSeries = useMemo(() => {
    const raw = global_?.visitSeriesRaw || []
    if (visitRange === 'month') {
      const cutoff = fmtDate(new Date(Date.now() - 30 * 86400000))
      return raw.filter((v) => String(v.d) > cutoff)
        .map((v) => ({ date: fmtDate(v.d).slice(5), 방문: Number(v.cnt) }))
    }
    const byMonth = {}
    for (const v of raw) {
      const key = String(v.d).slice(0, 7)
      byMonth[key] = (byMonth[key] || 0) + Number(v.cnt)
    }
    return Object.keys(byMonth).sort()
      .map((key) => ({ date: key.slice(2).replace('-', '.'), 방문: byMonth[key] }))
  }, [global_, visitRange])

  const visibleCourseViewRates = useMemo(() => {
    if (!cohortStats) return []
    return cohortStats.courseViewRates.filter((course) => course.groupId === courseGroupId)
  }, [cohortStats, courseGroupId])

  if (loadError) return <EmptyState title="대시보드를 불러오지 못했습니다" action={<button className="btn btn-white" onClick={() => window.location.reload()}>다시 시도</button>} />
  if (!global_) return <Loading />

  return (
    <div className="stack" style={{ gap: 32 }}>
      <section>
        <h2 className="t-h2 mb-16">전체 현황</h2>
        <div className="kpi-row mb-24">
          <StatCard label="전체 학생 수" value={global_.totalStudents.toLocaleString()} caption="기수 배정 기준" large />
          <StatCard label="전체 강좌 수" value={global_.totalCourses.toLocaleString()} />
          <StatCard label="과제 제출 건수" value={global_.totalSubmissions.toLocaleString()} />
          <StatCard label="미답변 문의" value={global_.unanswered.toLocaleString()} />
          <StatCard label="방문자 (오늘/누적)" value={`${global_.visits.today} / ${Number(global_.visits.total).toLocaleString()}`} />
        </div>
        <div className="grid-2 mb-24">
          <div className="chart-panel">
            <h3 className="t-h3 mb-16">기수별 학생 수</h3>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={perCohort}>
                <defs>
                  <linearGradient id="barGradCohort" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3d6db3" />
                    <stop offset="55%" stopColor="#1a3356" />
                    <stop offset="100%" stopColor="#152945" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                <Bar dataKey="학생수" fill="url(#barGradCohort)" radius={[6, 6, 0, 0]} maxBarSize={24}
                  label={{ position: 'top', fontSize: 11 }} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-panel">
            <div className="row mb-16" style={{ gap: 6 }}>
              <h3 className="t-h3">방문 추이 {visitRange === 'month' ? '(최근 30일)' : '(최근 1년)'}</h3>
              <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                <button className={`btn btn-sm ${visitRange === 'month' ? 'btn-primary' : 'btn-white'}`}
                  onClick={() => setVisitRange('month')}>1개월</button>
                <button className={`btn btn-sm ${visitRange === 'year' ? 'btn-primary' : 'btn-white'}`}
                  onClick={() => setVisitRange('year')}>연간</button>
              </div>
            </div>
            {visitSeries.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>아직 방문 기록이 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={visitSeries}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                  <Line type="monotone" dataKey="방문" stroke="var(--chart-1)" strokeWidth={2}
                    dot={visitRange === 'year' ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 } : false}
                    isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="mb-24"><AiBookmarks /></div>
        <div className="grid-2">
          <div className="chart-panel">
            <div className="row mb-16" style={{ gap: 8 }}>
              <IconSpeakerphone size={18} stroke={1.75} color="var(--primary)" />
              <h3 className="t-h3">공지사항</h3>
              <Link to="/notices" className="btn btn-text" style={{ marginLeft: 'auto' }}>공지 관리로 이동</Link>
            </div>
            {global_.notices.length === 0 ? (
              <div className="t-muted-sm">등록된 공지가 없습니다.</div>
            ) : global_.notices.map((nt) => (
              <div key={nt.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="t-muted-sm row" style={{ gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nt.pinned && <IconPin size={14} stroke={1.75} color="var(--accent-deep)" />}
                  {nt.title}
                </span>
                <span className="t-caption muted-soft tnum" style={{ flexShrink: 0 }}>{fmtDate(nt.created_at)}</span>
              </div>
            ))}
          </div>
          <MemoBoard />
        </div>
      </section>

      {selectedId && (
        <section>
          <h2 className="t-h2 mb-16">{selected?.name} 현황</h2>
          {cohortStats === undefined ? <Loading /> : cohortStats && (
            <>
              <div className="kpi-row mb-24">
                <StatCard label="학생 수 (활성/전체)" value={`${cohortStats.active} / ${cohortStats.students}`} />
                <StatCard label="과제 제출률" value={`${cohortStats.submitRate}%`} />
                <StatCard label="설문 응답률" value={`${cohortStats.surveyRate}%`} />
                <StatCard label="퀴즈 응시율" value={`${cohortStats.quizRate}%`} />
                <StatCard label="퀴즈 평균 점수" value={cohortStats.avgScore} caption="채점 완료 기준" />
              </div>
              <div className="grid-2">
                <div className="chart-panel dashboard-course-view-panel">
                  <div className="row-between mb-16" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <h3 className="t-h3">강좌별 열람률</h3>
                    <select className="select-sm dashboard-course-group-select" value={courseGroupId}
                      onChange={(event) => setCourseGroupId(event.target.value)} aria-label="열람률 강좌 그룹 선택">
                      {cohortStats.courseGroups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>
                  {visibleCourseViewRates.length === 0 ? (
                    <div className="empty-state dashboard-course-view-empty">선택한 그룹에 등록된 강좌가 없습니다.</div>
                  ) : <div className="dashboard-course-view-scroll">
                  <ResponsiveContainer width="100%" height={Math.max(220, visibleCourseViewRates.length * 34)}>
                    <BarChart data={visibleCourseViewRates} layout="vertical">
                      <defs>
                        {/* 가로 막대 — 두께 방향(위→아래) 그라디언트로 원통형 입체감 */}
                        <linearGradient id="barGradView" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3d6db3" />
                          <stop offset="55%" stopColor="#1a3356" />
                          <stop offset="100%" stopColor="#152945" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                      <Bar dataKey="열람률" fill="url(#barGradView)" radius={[0, 6, 6, 0]} maxBarSize={20}
                        label={{ position: 'right', fontSize: 11, formatter: (v) => `${v}%` }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                  </div>}
                </div>
                <div className="stack">
                  <div className="chart-panel">
                    <h3 className="t-h3 mb-16">만족도 상위 강좌 TOP 5 <span className="t-caption muted-soft">(전 기수 통합 평균)</span></h3>
                    {cohortStats.topRated.length === 0 ? (
                      <div className="t-muted-sm">아직 만족도 평가가 없습니다. 학생이 강좌 상세에서 별점을 남기면 표시됩니다.</div>
                    ) : cohortStats.topRated.map((r, i) => (
                      <div key={r.cohort_course_id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="t-muted-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span className="t-label tnum" style={{ color: 'var(--accent-deep)', marginRight: 8 }}>{i + 1}</span>
                          {pad2(r.course.course_no)}. {r.course.title}
                        </span>
                        <StarRating value={r.avg_rating} size={13} showValue count={r.rating_count} />
                      </div>
                    ))}
                  </div>
                  <div className="chart-panel">
                    <h3 className="t-h3 mb-16">최근 문의 (미답변 우선)</h3>
                    {cohortStats.inquiries.length === 0 ? (
                      <div className="t-muted-sm">문의가 없습니다.</div>
                    ) : cohortStats.inquiries.map((q) => (
                      <div key={q.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="t-muted-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.title} <span className="muted-soft">— {q.profiles?.name}</span>
                        </span>
                        {q.status === 'open'
                          ? <span className="pill pill-open"><span className="dot" />대기</span>
                          : <span className="pill pill-done"><span className="dot" />완료</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <section className="chart-panel">
        <div className="row mb-16" style={{ gap: 8 }}>
          <IconMessages size={18} stroke={1.75} color="var(--primary)" />
          <h3 className="t-h3">공개게시판 최근 게시글</h3>
          <Link to="/board" className="btn btn-text" style={{ marginLeft: 'auto' }}>게시판 관리로 이동</Link>
        </div>
        {global_.boardPosts.length === 0 ? (
          <div className="t-muted-sm">아직 게시글이 없습니다.</div>
        ) : (
          <>
            <div className="board-widget-row head t-caption muted-soft">
              <span>제목</span><span>소속</span><span>작성자</span><span>작성일시</span>
            </div>
            {global_.boardPosts.map((p) => (
              <Link key={p.id} to={`/board?post=${p.id}`} className="board-widget-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span>
                  {p.title}
                  {(p.board_comments?.[0]?.count || 0) > 0 && (
                    <span className="t-caption" style={{ color: 'var(--primary)', marginLeft: 6 }}>[{p.board_comments[0].count}]</span>
                  )}
                </span>
                <span className="t-muted-sm">{p.author_org || '-'}</span>
                <span className="t-muted-sm">{p.author_name}{p.is_guest ? ' (게스트)' : ''}</span>
                <span className="t-caption muted-soft tnum">{fmtDate(p.created_at, true)}</span>
              </Link>
            ))}
          </>
        )}
      </section>
    </div>
  )
}

/* ============ 관리자 전용 메모 게시판 ============ */
function MemoBoard() {
  const { profile } = useAuth()
  const toast = useToast()
  const [memos, setMemos] = useState(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('admin_memos')
      .select('*, profiles(name, nickname)')
      .order('created_at', { ascending: false }).limit(30)
    setMemos(data || [])
  }
  useEffect(() => { load() }, [])

  async function create() {
    const body = draft.trim()
    if (!body) { setComposing(false); setDraft(''); return }
    setBusy(true)
    const { error } = await supabase.from('admin_memos').insert({ author_id: profile.id, body })
    setBusy(false)
    if (error) { toast('메모 저장에 실패했습니다.', 'error'); return }
    setDraft(''); setComposing(false)
    load()
  }

  async function saveEdit() {
    const body = editDraft.trim()
    if (!body) return
    setBusy(true)
    const { error } = await supabase.from('admin_memos')
      .update({ body, updated_at: new Date().toISOString() }).eq('id', editingId)
    setBusy(false)
    if (error) { toast('메모 수정에 실패했습니다.', 'error'); return }
    setEditingId(null)
    load()
  }

  async function remove(id) {
    setBusy(true)
    const { error } = await supabase.from('admin_memos').delete().eq('id', id)
    setBusy(false)
    if (error) { toast('메모 삭제에 실패했습니다.', 'error'); return }
    setEditingId(null)
    load()
  }

  return (
    <div className="chart-panel">
      <div className="row mb-16" style={{ gap: 8 }}>
        <IconNotes size={18} stroke={1.75} color="var(--accent-deep)" />
        <h3 className="t-h3">관리자 전용 메모</h3>
        <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>관리자에게만 보입니다</span>
      </div>
      <div className="memo-board">
        {composing ? (
          <div className="memo-item" style={{ cursor: 'default' }}>
            <textarea
              className="textarea" autoFocus
              style={{ minHeight: 72, background: 'transparent', border: 'none', padding: 0 }}
              placeholder="메모를 입력하세요…"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) create() }}
            />
            <div className="row mt-8" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn btn-white btn-sm" disabled={busy} onClick={() => { setComposing(false); setDraft('') }}>취소</button>
              <button className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={create}>
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <div className="memo-composer" onClick={() => setComposing(true)}>
            + 여기를 눌러 바로 메모를 작성하세요
          </div>
        )}
        {memos === null ? <Loading /> : memos.map((m) => (
          editingId === m.id ? (
            <div key={m.id} className="memo-item" style={{ cursor: 'default' }}>
              <textarea
                className="textarea" autoFocus
                style={{ minHeight: 72, background: 'transparent', border: 'none', padding: 0 }}
                value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit() }}
              />
              <div className="row mt-8" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="icon-btn danger" title="삭제" disabled={busy} onClick={() => remove(m.id)}>
                  <IconTrash size={16} stroke={1.75} />
                </button>
                <button className="btn btn-white btn-sm" disabled={busy} onClick={() => setEditingId(null)}>취소</button>
                <button className="btn btn-primary btn-sm" disabled={busy || !editDraft.trim()} onClick={saveEdit}>
                  {busy ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div key={m.id} className="memo-item" title="클릭하여 수정·삭제"
              onClick={() => { setEditingId(m.id); setEditDraft(m.body) }}>
              <div className="memo-body">{m.body}</div>
              <div className="memo-meta">
                {m.profiles?.nickname || m.profiles?.name || '관리자'} · {fmtDate(m.updated_at || m.created_at, true)}
              </div>
            </div>
          )
        ))}
        {memos && memos.length === 0 && !composing && (
          <div className="t-caption muted-soft" style={{ textAlign: 'center', padding: 8 }}>아직 메모가 없습니다.</div>
        )}
      </div>
    </div>
  )
}
