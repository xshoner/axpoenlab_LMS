import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconPaperclip, IconChecklist, IconPencilQuestion,
  IconBook2, IconBulb, IconRocket, IconChartDots, IconPuzzle, IconTargetArrow,
} from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill, StarRating } from '../../shared/ui'
import { pad2 } from '../../lib/helpers'

const THEME_ICONS = [IconBook2, IconBulb, IconRocket, IconChartDots, IconPuzzle, IconTargetArrow]

export default function Courses() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [coursesQ, viewsQ, ratingsQ] = await Promise.all([
        supabase.from('cohort_courses')
          .select('id, course_no, title, summary, cohort_attachments(id), surveys(id, status), quizzes(id, status)')
          .order('course_no'),
        supabase.from('course_views').select('cohort_course_id').eq('user_id', profile.id),
        supabase.from('course_rating_stats').select('cohort_course_id, avg_rating, rating_count'),
      ])
      if (!alive) return
      const viewedSet = new Set((viewsQ.data || []).map((v) => v.cohort_course_id))
      const ratingMap = {}
      for (const r of ratingsQ.data || []) ratingMap[r.cohort_course_id] = r
      setRows((coursesQ.data || []).map((c) => ({ ...c, viewed: viewedSet.has(c.id), stats: ratingMap[c.id] })))
    })()
    return () => { alive = false }
  }, [profile.id])

  if (!rows) return <Loading />
  if (rows.length === 0)
    return <EmptyState title="배정된 강좌가 없습니다" description="기수에 배정되면 강좌가 표시됩니다." />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {rows.map((c, idx) => {
        const surveyCount = (c.surveys || []).filter((s) => s.status !== 'draft').length
        const quizCount = (c.quizzes || []).filter((q) => q.status !== 'draft').length
        const theme = ((Number(c.course_no) || idx + 1) - 1) % 6
        const ThemeIcon = THEME_ICONS[theme]
        return (
          <Link key={c.id} to={`/courses/${c.id}`} className={`card-course theme-${theme} ${c.viewed ? 'viewed' : ''}`}>
            <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
            <div className="row-between mb-16">
              <div className="row" style={{ gap: 10 }}>
                <span className="card-course-icon"><ThemeIcon size={20} stroke={1.75} /></span>
                <span className="badge-course-no">{pad2(c.course_no)}</span>
              </div>
              {c.viewed ? <StatusPill kind="done">열람</StatusPill> : <StatusPill kind="neutral">미열람</StatusPill>}
            </div>
            <div className="t-h3 mb-8">{c.title}</div>
            <div className="t-muted-sm" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>
              {c.summary}
            </div>
            <div className="card-course-meta">
              {(c.cohort_attachments || []).length > 0 && (
                <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.cohort_attachments.length}</span>
              )}
              {surveyCount > 0 && <span className="pill pill-neutral"><IconChecklist size={12} stroke={1.75} /> 설문 {surveyCount}</span>}
              {quizCount > 0 && <span className="pill pill-neutral"><IconPencilQuestion size={12} stroke={1.75} /> 퀴즈 {quizCount}</span>}
              {c.stats && (
                <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                  <StarRating value={c.stats.avg_rating} size={13} showValue />
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
