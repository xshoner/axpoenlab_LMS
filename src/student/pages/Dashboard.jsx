import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconClipboardText, IconChecklist, IconPencilQuestion } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState } from '../../shared/ui'
import { AiBookmarks } from '../../shared/bookmarks'
import { fmtDate, isNew, pad2 } from '../../lib/helpers'

export default function Dashboard() {
  const { profile, cohort } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const uid = profile.id
      const [coursesQ, viewsQ, subsQ, noticesQ, boardQ] = await Promise.all([
        supabase.from('cohort_courses').select('id, course_no, title, assignment_enabled, assignment_due').order('course_no'),
        supabase.from('course_views').select('cohort_course_id').eq('user_id', uid),
        supabase.from('submissions').select('cohort_course_id').eq('user_id', uid),
        supabase.from('notices').select('id, title, created_at, pinned').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(5),
        supabase.from('board_posts')
          .select('id, title, author_name, author_org, created_at, board_comments(count)')
          .order('created_at', { ascending: false }).limit(5),
      ])
      const courses = coursesQ.data || []
      const courseIds = courses.map((c) => c.id)
      let surveys = [], quizzes = [], myResponses = [], myQuizSubs = []
      if (courseIds.length) {
        const [sv, qz] = await Promise.all([
          supabase.from('surveys').select('id, cohort_course_id, status').in('cohort_course_id', courseIds).eq('status', 'open'),
          supabase.from('quizzes').select('id, cohort_course_id, status').in('cohort_course_id', courseIds).eq('status', 'open'),
        ])
        surveys = sv.data || []
        quizzes = qz.data || []
        if (surveys.length) {
          const { data: r } = await supabase.from('survey_responses').select('survey_id').eq('user_id', uid)
          myResponses = r || []
        }
        if (quizzes.length) {
          const { data: r } = await supabase.from('quiz_submissions').select('quiz_id').eq('user_id', uid)
          myQuizSubs = r || []
        }
      }
      if (!alive) return
      const viewedSet = new Set((viewsQ.data || []).map((v) => v.cohort_course_id))
      const subSet = new Set((subsQ.data || []).map((s) => s.cohort_course_id))
      const respSet = new Set(myResponses.map((r) => r.survey_id))
      const quizSet = new Set(myQuizSubs.map((r) => r.quiz_id))
      setData({
        courses,
        viewedSet,
        notices: noticesQ.data || [],
        boardPosts: boardQ.data || [],
        todo: {
          assignments: courses.filter((c) => c.assignment_enabled && !subSet.has(c.id)).length,
          surveys: surveys.filter((s) => !respSet.has(s.id)).length,
          quizzes: quizzes.filter((q) => !quizSet.has(q.id)).length,
        },
      })
    })()
    return () => { alive = false }
  }, [profile.id])

  if (!data) return <Loading />

  const { courses, viewedSet, notices, boardPosts, todo } = data
  const viewed = courses.filter((c) => viewedSet.has(c.id)).length
  const pct = courses.length ? Math.round((viewed / courses.length) * 100) : 0
  const allDone = todo.assignments === 0 && todo.surveys === 0 && todo.quizzes === 0

  return (
    <div className="stack" style={{ gap: 32 }}>
      <div>
        <h1 className="t-display">{profile.name}님, 안녕하세요.</h1>
        <p className="t-muted-sm">{cohort ? cohort.name : '아직 기수에 배정되지 않았습니다. 관리자에게 문의해 주세요.'}</p>
      </div>

      <section className="card-panel">
        <div className="row-between mb-16">
          <h2 className="t-h2">강좌 열람 히트맵</h2>
          <span className="t-label tnum">
            {viewed} / {courses.length} 강좌 열람 <span className="muted">({pct}%)</span>
            {pct === 100 && courses.length > 0 && (
              <span className="pill pill-done" style={{ marginLeft: 8 }}><span className="dot" />전 강좌 열람 완료</span>
            )}
          </span>
        </div>
        <div className="progress-track mb-16">
          <div className={`progress-fill ${pct === 100 ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        {courses.length === 0 ? (
          <EmptyState title="아직 배정된 강좌가 없습니다" description="기수 배정 후 강좌가 표시됩니다." />
        ) : (
          <div className="heatmap-grid" style={{ position: 'relative' }}>
            {courses.map((c) => {
              const isViewed = viewedSet.has(c.id)
              return (
                <button
                  key={c.id}
                  className={`heatmap-cell ${isViewed ? 'viewed' : ''}`}
                  aria-label={`${pad2(c.course_no)}강 ${c.title} ${isViewed ? '열람 완료' : '미열람'}`}
                  title={c.title}
                  onClick={() => nav(`/courses/${c.id}`)}
                  onMouseEnter={() => setTooltip(c.id)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {pad2(c.course_no)}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="card-todo">
        {allDone ? (
          <div className="t-emph" style={{ textAlign: 'center', color: 'var(--primary)' }}>지금 할 일이 없습니다.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <TodoCell icon={IconClipboardText} count={todo.assignments} label="미제출 과제" to="/assignments" />
            <TodoCell icon={IconChecklist} count={todo.surveys} label="미응답 설문" to="/courses" />
            <TodoCell icon={IconPencilQuestion} count={todo.quizzes} label="미응시 퀴즈" to="/courses" />
          </div>
        )}
      </section>

      <AiBookmarks />

      <section className="card-panel">
        <div className="row-between mb-16">
          <h2 className="t-h2">공지사항</h2>
          <Link to="/notices" className="btn btn-text">더보기</Link>
        </div>
        {notices.length === 0 ? (
          <EmptyState title="등록된 공지가 없습니다" />
        ) : (
          <div>
            {notices.map((n) => (
              <Link key={n.id} to={`/notices/${n.id}`} className="attachment-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                {n.pinned && <span className="pill pill-neutral">고정</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                {isNew(n.created_at) && <span className="badge-new">NEW</span>}
                <span className="size tnum">{fmtDate(n.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="card-panel">
        <div className="row-between mb-16">
          <h2 className="t-h2">공개게시판 최근 글</h2>
          <Link to="/board" className="btn btn-text">더보기</Link>
        </div>
        {boardPosts.length === 0 ? (
          <EmptyState title="아직 게시글이 없습니다" description="공개게시판에 첫 글을 남겨 보세요." />
        ) : (
          <div>
            <div className="board-widget-row head t-caption muted-soft">
              <span>제목</span><span>소속</span><span>작성자</span><span>작성일시</span>
            </div>
            {boardPosts.map((p) => (
              <Link key={p.id} to={`/board/${p.id}`} className="board-widget-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span>
                  {p.title}
                  {(p.board_comments?.[0]?.count || 0) > 0 && (
                    <span className="t-caption" style={{ color: 'var(--primary)', marginLeft: 6 }}>[{p.board_comments[0].count}]</span>
                  )}
                  {isNew(p.created_at) && <span className="badge-new" style={{ marginLeft: 6 }}>NEW</span>}
                </span>
                <span className="t-muted-sm">{p.author_org || '-'}</span>
                <span className="t-muted-sm">{p.author_name}</span>
                <span className="t-caption muted-soft tnum">{fmtDate(p.created_at, true)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TodoCell({ icon: Icon, count, label, to }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Icon size={20} stroke={1.75} color={count > 0 ? 'var(--primary)' : 'var(--muted-soft)'} />
      <span className="t-stat tnum" style={{ color: count > 0 ? 'var(--primary)' : 'var(--muted-soft)' }}>{count}</span>
      <span className="t-caption" style={{ color: 'var(--muted)' }}>{label}</span>
    </Link>
  )
}
