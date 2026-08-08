import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconPaperclip, IconChecklist, IconPencilQuestion } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill } from '../../shared/ui'
import { pad2 } from '../../lib/helpers'

export default function Courses() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [coursesQ, viewsQ] = await Promise.all([
        supabase.from('cohort_courses')
          .select('id, course_no, title, summary, cohort_attachments(id), surveys(id, status), quizzes(id, status)')
          .order('course_no'),
        supabase.from('course_views').select('cohort_course_id').eq('user_id', profile.id),
      ])
      if (!alive) return
      const viewedSet = new Set((viewsQ.data || []).map((v) => v.cohort_course_id))
      setRows((coursesQ.data || []).map((c) => ({ ...c, viewed: viewedSet.has(c.id) })))
    })()
    return () => { alive = false }
  }, [profile.id])

  if (!rows) return <Loading />
  if (rows.length === 0)
    return <EmptyState title="배정된 강좌가 없습니다" description="기수에 배정되면 강좌가 표시됩니다." />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {rows.map((c) => {
        const surveyCount = (c.surveys || []).filter((s) => s.status !== 'draft').length
        const quizCount = (c.quizzes || []).filter((q) => q.status !== 'draft').length
        return (
          <Link key={c.id} to={`/courses/${c.id}`} className={`card-course ${c.viewed ? 'viewed' : ''}`}>
            <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
            <div className="row-between mb-8">
              <span className="badge-course-no">{pad2(c.course_no)}</span>
              {c.viewed ? <StatusPill kind="done">열람</StatusPill> : <StatusPill kind="neutral">미열람</StatusPill>}
            </div>
            <div className="t-h3 mb-8">{c.title}</div>
            <div className="t-muted-sm" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>
              {c.summary}
            </div>
            <div className="row mt-16" style={{ gap: 8, flexWrap: 'wrap' }}>
              {(c.cohort_attachments || []).length > 0 && (
                <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.cohort_attachments.length}</span>
              )}
              {surveyCount > 0 && <span className="pill pill-neutral"><IconChecklist size={12} stroke={1.75} /> 설문 {surveyCount}</span>}
              {quizCount > 0 && <span className="pill pill-neutral"><IconPencilQuestion size={12} stroke={1.75} /> 퀴즈 {quizCount}</span>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
