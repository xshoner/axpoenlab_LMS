import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { Loading, StatCard } from '../../shared/ui'
import { fmtDate, pad2 } from '../../lib/helpers'

export default function AdminDashboard() {
  const { cohorts, selectedId, selected } = useCohort()
  const [global_, setGlobal] = useState(null)
  const [cohortStats, setCohortStats] = useState(null)

  // 전역 통계
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [membersQ, coursesQ, subsQ, inqQ, visitsQ, visitSeriesQ] = await Promise.all([
        supabase.from('cohort_members').select('cohort_id'),
        supabase.from('cohort_courses').select('id', { count: 'exact', head: true }),
        supabase.from('submissions').select('id', { count: 'exact', head: true }),
        supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.rpc('visit_stats'),
        supabase.rpc('visit_series', { p_days: 30 }),
      ])
      if (!alive) return
      const perCohort = cohorts.map((c) => ({
        name: c.name,
        학생수: (membersQ.data || []).filter((m) => m.cohort_id === c.id).length,
      }))
      setGlobal({
        totalStudents: (membersQ.data || []).length,
        totalCourses: coursesQ.count || 0,
        totalSubmissions: subsQ.count || 0,
        unanswered: inqQ.count || 0,
        visits: visitsQ.data || { today: 0, total: 0 },
        visitSeries: (visitSeriesQ.data || []).map((v) => ({ date: fmtDate(v.d).slice(5), 방문: Number(v.cnt) })),
        perCohort,
      })
    })()
    return () => { alive = false }
  }, [cohorts])

  // 선택 기수 통계
  useEffect(() => {
    if (!selectedId) { setCohortStats(null); return }
    let alive = true
    ;(async () => {
      setCohortStats(undefined)
      const { data: members } = await supabase.from('cohort_members')
        .select('user_id, profiles(name, status)').eq('cohort_id', selectedId)
      const userIds = (members || []).map((m) => m.user_id)
      const { data: courses } = await supabase.from('cohort_courses')
        .select('id, course_no, title, assignment_enabled').eq('cohort_id', selectedId).order('course_no')
      const courseIds = (courses || []).map((c) => c.id)

      let views = [], subs = [], surveys = [], quizzes = [], responses = [], quizSubs = [], inquiries = []
      if (courseIds.length) {
        const [vQ, sQ, svQ, qzQ] = await Promise.all([
          supabase.from('course_views').select('user_id, cohort_course_id').in('cohort_course_id', courseIds),
          supabase.from('submissions').select('user_id, cohort_course_id').in('cohort_course_id', courseIds),
          supabase.from('surveys').select('id, status').in('cohort_course_id', courseIds).neq('status', 'draft'),
          supabase.from('quizzes').select('id, status').in('cohort_course_id', courseIds).neq('status', 'draft'),
        ])
        views = vQ.data || []; subs = sQ.data || []; surveys = svQ.data || []; quizzes = qzQ.data || []
        if (surveys.length) {
          const { data } = await supabase.from('survey_responses').select('survey_id, user_id').in('survey_id', surveys.map((s) => s.id))
          responses = data || []
        }
        if (quizzes.length) {
          const { data } = await supabase.from('quiz_submissions').select('quiz_id, user_id, total_score, graded').in('quiz_id', quizzes.map((q) => q.id))
          quizSubs = data || []
        }
      }
      const { data: inq } = await supabase.from('inquiries')
        .select('id, title, status, created_at, profiles(name)')
        .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
        .order('status', { ascending: false }).order('created_at', { ascending: false }).limit(10)
      inquiries = inq || []

      if (!alive) return
      const n = userIds.length
      const courseViewRates = (courses || []).map((c) => ({
        name: `${pad2(c.course_no)}. ${c.title.slice(0, 12)}`,
        열람률: n ? Math.round((views.filter((v) => v.cohort_course_id === c.id).length / n) * 100) : 0,
      }))
      const assignCourses = (courses || []).filter((c) => c.assignment_enabled)
      const submitRate = n && assignCourses.length
        ? Math.round((subs.length / (n * assignCourses.length)) * 100) : 0
      const surveyRate = n && surveys.length
        ? Math.round((responses.length / (n * surveys.length)) * 100) : 0
      const quizRate = n && quizzes.length
        ? Math.round((quizSubs.length / (n * quizzes.length)) * 100) : 0
      const gradedScores = quizSubs.filter((s) => s.graded && s.total_score != null).map((s) => Number(s.total_score))
      const avgScore = gradedScores.length ? (gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length).toFixed(1) : '-'
      const lowViewCourses = [...courseViewRates].sort((a, b) => a.열람률 - b.열람률).slice(0, 5)

      setCohortStats({
        students: n,
        active: (members || []).filter((m) => m.profiles?.status === 'active').length,
        courseViewRates, lowViewCourses, submitRate, surveyRate, quizRate, avgScore, inquiries,
      })
    })()
    return () => { alive = false }
  }, [selectedId])

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
        <div className="grid-2">
          <div className="chart-panel">
            <h3 className="t-h3 mb-16">기수별 학생 수</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={global_.perCohort}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                <Bar dataKey="학생수" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28}
                  label={{ position: 'top', fontSize: 12 }} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-panel">
            <h3 className="t-h3 mb-16">방문 추이 (최근 30일)</h3>
            {global_.visitSeries.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>아직 방문 기록이 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={global_.visitSeries}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                  <Line type="monotone" dataKey="방문" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
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
                <div className="chart-panel">
                  <h3 className="t-h3 mb-16">강좌별 열람률</h3>
                  <ResponsiveContainer width="100%" height={Math.max(200, cohortStats.courseViewRates.length * 34)}>
                    <BarChart data={cohortStats.courseViewRates} layout="vertical">
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                      <Bar dataKey="열람률" fill="var(--chart-1)" radius={[0, 6, 6, 0]} maxBarSize={20}
                        label={{ position: 'right', fontSize: 11, formatter: (v) => `${v}%` }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="stack">
                  <div className="chart-panel">
                    <h3 className="t-h3 mb-16">미열람률 상위 강좌 TOP 5</h3>
                    {cohortStats.lowViewCourses.map((c) => (
                      <div key={c.name} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="t-muted-sm">{c.name}</span>
                        <span className="t-label tnum" style={{ color: c.열람률 < 40 ? 'var(--danger)' : 'var(--foreground)' }}>{c.열람률}%</span>
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
    </div>
  )
}
