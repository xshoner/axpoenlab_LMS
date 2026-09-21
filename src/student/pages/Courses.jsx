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
  const { profile, cohort } = useAuth()
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('cohort_course_groups').select('id, name, sort_order, is_default')
        .order('sort_order').order('created_at')
      if (!alive) return
      const next = data || []
      setGroups(next)
      const storageKey = `ax-course-group:${profile.id}:${cohort?.id || 'none'}`
      const saved = window.localStorage.getItem(storageKey)
      setGroupId(next.some((group) => group.id === saved)
        ? saved
        : next.find((group) => group.is_default)?.id || next[0]?.id || '')
    })()
    return () => { alive = false }
  }, [profile.id, cohort?.id])

  useEffect(() => {
    if (!groupId) { if (groups) setRows([]); return }
    let alive = true
    setRows(null)
    window.localStorage.setItem(`ax-course-group:${profile.id}:${cohort?.id || 'none'}`, groupId)
    supabase.rpc('student_course_list', { p_group_id: groupId }).then(({ data }) => {
      if (alive) setRows(data || [])
    })
    return () => { alive = false }
  }, [groupId, profile.id, cohort?.id])

  if (!groups || !rows) return <Loading />
  if (groups.length === 0)
    return <EmptyState title="공개된 강좌 그룹이 없습니다" description="관리자가 강좌를 공개하면 이곳에 표시됩니다." />
  if (rows.length === 0)
    return <>
      <CourseGroupPicker groups={groups} groupId={groupId} onChange={setGroupId} />
      <EmptyState title="이 그룹에 배정된 강좌가 없습니다" description="다른 강좌 그룹을 선택하거나 관리자에게 문의해 주세요." />
    </>

  return (
    <div className="stack" style={{ gap: 20 }}>
      <CourseGroupPicker groups={groups} groupId={groupId} onChange={setGroupId} />
      <div className="course-grid">
        {rows.map((c, idx) => {
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
                {c.attachment_count > 0 && <span className="pill pill-neutral"><IconPaperclip size={12} stroke={1.75} /> 첨부 {c.attachment_count}</span>}
                {c.survey_count > 0 && <span className="pill pill-neutral"><IconChecklist size={12} stroke={1.75} /> 설문 {c.survey_count}</span>}
                {c.quiz_count > 0 && <span className="pill pill-neutral"><IconPencilQuestion size={12} stroke={1.75} /> 퀴즈 {c.quiz_count}</span>}
                {c.rating_count > 0 && <span className="row" style={{ gap: 4, marginLeft: 'auto' }}><StarRating value={c.avg_rating} size={13} showValue /></span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function CourseGroupPicker({ groups, groupId, onChange }) {
  return (
    <div className="student-course-group-picker">
      <div>
        <div className="t-caption muted-soft">강좌 그룹</div>
        <div className="t-h2">{groups.find((group) => group.id === groupId)?.name}</div>
      </div>
      <select className="select" value={groupId} onChange={(event) => onChange(event.target.value)} aria-label="강좌 그룹 선택">
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
    </div>
  )
}
