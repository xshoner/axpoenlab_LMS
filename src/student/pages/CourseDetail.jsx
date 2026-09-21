import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconDownload, IconExternalLink, IconChevronLeft, IconChevronRight, IconFile } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill, StarRating, useToast } from '../../shared/ui'
import { pad2, fmtBytes, fmtDate, downloadFile } from '../../lib/helpers'
import RichBody from '../../shared/RichBody'

export default function CourseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const [course, setCourse] = useState(null)
  const [siblings, setSiblings] = useState([])
  const [surveyStates, setSurveyStates] = useState([])
  const [quizStates, setQuizStates] = useState([])
  const [myRating, setMyRating] = useState(0)
  const [ratingStats, setRatingStats] = useState(null)
  const [ratingBusy, setRatingBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // 열람 판정: 페이지 진입 즉시 (Q6)
      supabase.rpc('record_course_view', { p_course_id: id }).then(() => {})
      const [cQ, allQ, rQ, rsQ] = await Promise.all([
        supabase.from('cohort_courses')
          .select('*, cohort_attachments(*), surveys(id, title, status, allow_edit), quizzes(id, title, status, reveal_answers)')
          .eq('id', id).single(),
        supabase.from('cohort_courses').select('id, group_id, course_no').order('course_no'),
        supabase.from('course_ratings').select('rating').eq('cohort_course_id', id).eq('user_id', profile.id).maybeSingle(),
        supabase.from('course_rating_stats').select('avg_rating, rating_count').eq('cohort_course_id', id).maybeSingle(),
      ])
      if (!alive) return
      if (!cQ.data) { setCourse(false); return }
      setCourse(cQ.data)
      setSiblings((allQ.data || []).filter((sibling) => sibling.group_id === cQ.data.group_id))
      setMyRating(rQ.data?.rating || 0)
      setRatingStats(rsQ.data || null)
      const openSurveys = (cQ.data.surveys || []).filter((s) => s.status !== 'draft')
      const openQuizzes = (cQ.data.quizzes || []).filter((q) => q.status !== 'draft')
      if (openSurveys.length) {
        const { data: r } = await supabase.from('survey_responses').select('survey_id').eq('user_id', profile.id)
          .in('survey_id', openSurveys.map((s) => s.id))
        if (alive) setSurveyStates((r || []).map((x) => x.survey_id))
      }
      if (openQuizzes.length) {
        const { data: r } = await supabase.from('quiz_submissions').select('quiz_id, graded').eq('user_id', profile.id)
          .in('quiz_id', openQuizzes.map((q) => q.id))
        if (alive) setQuizStates(r || [])
      }
    })()
    return () => { alive = false }
  }, [id, profile.id])

  if (course === null) return <Loading />
  if (course === false) return <EmptyState title="강좌를 찾을 수 없습니다" />

  const idx = siblings.findIndex((s) => s.id === id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  const surveys = (course.surveys || []).filter((s) => s.status !== 'draft')
  const quizzes = (course.quizzes || []).filter((q) => q.status !== 'draft')

  async function handleDownload(att) {
    try {
      await downloadFile('course-files', att.file_path, att.filename)
    } catch {
      toast('다운로드에 실패했습니다.', 'error')
    }
  }

  async function handleRate(n) {
    if (ratingBusy) return
    setRatingBusy(true)
    const prev = myRating
    setMyRating(n)
    const { data, error } = await supabase.rpc('rate_course', { p_course_id: id, p_rating: n })
    setRatingBusy(false)
    if (error || !data?.ok) {
      setMyRating(prev)
      toast('별점 저장에 실패했습니다.', 'error')
      return
    }
    toast(prev ? '별점이 수정되었습니다.' : '별점이 등록되었습니다. 소중한 평가 감사합니다!')
    const { data: rs } = await supabase.from('course_rating_stats')
      .select('avg_rating, rating_count').eq('cohort_course_id', id).maybeSingle()
    setRatingStats(rs || null)
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="badge-course-no" style={{ fontSize: 13, padding: '6px 10px' }}>{pad2(course.course_no)}</span>
        <h1 className="t-h1">{course.title}</h1>
      </div>
      {course.summary && <p className="t-muted-sm">{course.summary}</p>}

      <section className="card-panel">
        <RichBody html={course.body || '<p class="muted">본문이 없습니다.</p>'} />
      </section>

      {(course.cohort_attachments || []).length > 0 && (
        <section className="card-panel">
          <h2 className="t-h2 mb-16">첨부파일</h2>
          <div>
            {course.cohort_attachments.map((a) => (
              <div key={a.id} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn" onClick={() => handleDownload(a)} aria-label={`${a.filename} 다운로드`}>
                  <IconDownload size={18} stroke={1.75} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {course.external_url && (
        <section className="card-panel">
          <h2 className="t-h2 mb-8">외부 링크</h2>
          <a href={course.external_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
            <IconExternalLink size={16} stroke={1.75} /> {course.external_url}
          </a>
        </section>
      )}

      {surveys.length > 0 && (
        <section className="card-panel">
          <h2 className="t-h2 mb-16">설문</h2>
          <div className="stack" style={{ gap: 12 }}>
            {surveys.map((s) => {
              const responded = surveyStates.includes(s.id)
              return (
                <div key={s.id} className="row-between" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="t-emph">{s.title}</span>
                    {s.status === 'closed' && <StatusPill kind="closed">마감</StatusPill>}
                  </div>
                  {responded ? (
                    s.allow_edit && s.status === 'open' ? (
                      <Link to={`/surveys/${s.id}`} className="btn btn-white btn-sm">응답 수정</Link>
                    ) : (
                      <StatusPill kind="done">응답 완료</StatusPill>
                    )
                  ) : s.status === 'open' ? (
                    <Link to={`/surveys/${s.id}`} className="btn btn-primary btn-sm">설문 응답하기</Link>
                  ) : (
                    <span className="t-caption muted-soft">응답 기간 종료</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {quizzes.length > 0 && (
        <section className="card-panel">
          <h2 className="t-h2 mb-16">퀴즈</h2>
          <div className="stack" style={{ gap: 12 }}>
            {quizzes.map((q) => {
              const sub = quizStates.find((x) => x.quiz_id === q.id)
              let action
              if (!sub && q.status === 'open') {
                action = <Link to={`/quizzes/${q.id}`} className="btn btn-primary btn-sm">퀴즈 응시하기</Link>
              } else if (sub && q.status === 'open') {
                action = <StatusPill kind="open">제출 완료 (채점 대기)</StatusPill>
              } else if (q.status === 'closed') {
                action = sub
                  ? <Link to={`/quizzes/${q.id}`} className="btn btn-white btn-sm">결과 보기</Link>
                  : <span className="t-caption muted-soft">응시 기간 종료</span>
              } else {
                action = <span className="t-caption muted-soft">-</span>
              }
              return (
                <div key={q.id} className="row-between" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="t-emph">{q.title}</span>
                    {q.status === 'closed' && <StatusPill kind="done">채점 완료</StatusPill>}
                  </div>
                  {action}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {course.assignment_enabled && (
        <section className="card-panel">
          <div className="row-between">
            <div>
              <h2 className="t-h2">과제</h2>
              {course.assignment_due && (
                <span className="t-muted-sm tnum">
                  마감일 {fmtDate(course.assignment_due, true)}
                  {new Date(course.assignment_due) < new Date() && <span className="muted"> · 마감일 경과</span>}
                </span>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => nav(`/assignments?course=${course.id}`)}>
              과제 제출하러 가기
            </button>
          </div>
        </section>
      )}

      <section className="card-panel" style={{ textAlign: 'center' }}>
        <h2 className="t-h2 mb-8">이 강좌는 어떠셨나요?</h2>
        <p className="t-muted-sm mb-16">별점을 눌러 강좌 만족도를 남겨 주세요. 언제든 다시 수정할 수 있습니다.</p>
        <StarRating value={myRating} onChange={handleRate} size={32} />
        <div className="t-caption muted-soft mt-8">
          {myRating > 0 ? `내 평가: ${myRating}점` : '아직 평가하지 않았습니다'}
          {ratingStats && ratingStats.rating_count > 0 && (
            <> · 전체 평균 {Number(ratingStats.avg_rating).toFixed(1)}점 ({ratingStats.rating_count}명 참여)</>
          )}
        </div>
      </section>

      <div className="row-between">
        {prev ? (
          <button className="btn btn-white" onClick={() => nav(`/courses/${prev.id}`)}>
            <IconChevronLeft size={16} stroke={1.75} /> 이전 강좌
          </button>
        ) : <span />}
        {next ? (
          <button className="btn btn-white" onClick={() => nav(`/courses/${next.id}`)}>
            다음 강좌 <IconChevronRight size={16} stroke={1.75} />
          </button>
        ) : <span />}
      </div>
    </div>
  )
}
