import { useEffect, useState } from 'react'
import { IconDownload, IconFileSpreadsheet, IconExternalLink, IconArrowLeft, IconClipboardText } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { Dialog, EmptyState, Loading, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, pad2, downloadFile, downloadCsv } from '../../lib/helpers'

export default function AssignmentMatrix() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [openCourseId, setOpenCourseId] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!selectedId) { setData(null); return }
    let alive = true
    ;(async () => {
      setData(undefined)
      setOpenCourseId(null)
      const [membersQ, coursesQ] = await Promise.all([
        supabase.from('cohort_members').select('user_id, profiles(id, name, org)').eq('cohort_id', selectedId),
        supabase.from('cohort_courses').select('id, course_no, title, assignment_due')
          .eq('cohort_id', selectedId).eq('assignment_enabled', true).order('course_no'),
      ])
      const students = (membersQ.data || []).map((m) => m.profiles).filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      const courses = coursesQ.data || []
      let subs = []
      if (courses.length) {
        const { data: s } = await supabase.from('submissions').select('*')
          .in('cohort_course_id', courses.map((c) => c.id))
        subs = s || []
      }
      if (!alive) return
      setData({ students, courses, subs })
    })()
    return () => { alive = false }
  }, [selectedId])

  if (!selectedId) return <EmptyState title="기수를 선택해 주세요" description="상단의 기수 선택 드롭다운에서 기수를 선택하면 제출 현황이 표시됩니다." />
  if (data === undefined || data === null) return <Loading />

  const { students, courses, subs } = data
  const subMap = {}
  for (const s of subs) subMap[`${s.user_id}:${s.cohort_course_id}`] = s

  if (courses.length === 0) return <EmptyState title="과제가 설정된 강좌가 없습니다" description="강좌 관리에서 과제를 활성화해 주세요." />

  const openCourse = courses.find((c) => c.id === openCourseId)

  function exportAllCsv() {
    const header = ['성명', '소속', ...courses.map((c) => `${pad2(c.course_no)}. ${c.title}`)]
    const rows = students.map((st) => [
      st.name, st.org,
      ...courses.map((c) => (subMap[`${st.id}:${c.id}`] ? '제출' : '미제출')),
    ])
    downloadCsv(`과제제출현황_${selected?.name || ''}.csv`, [header, ...rows])
  }

  /* ---------- 강좌별 인원 상세 ---------- */
  if (openCourse) {
    const submitted = students.filter((st) => subMap[`${st.id}:${openCourse.id}`])
    const pct = students.length ? Math.round((submitted.length / students.length) * 100) : 0

    function exportCourseCsv() {
      const header = ['성명', '소속', '상태', '제출 일시', '유형']
      const rows = students.map((st) => {
        const sub = subMap[`${st.id}:${openCourse.id}`]
        return [st.name, st.org, sub ? '제출' : '미제출', sub ? fmtDate(sub.submitted_at, true) : '', sub ? (sub.type === 'file' ? '파일' : 'URL') : '']
      })
      downloadCsv(`과제제출현황_${selected?.name || ''}_${pad2(openCourse.course_no)}강.csv`, [header, ...rows])
    }

    return (
      <div className="stack" style={{ gap: 16 }}>
        <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenCourseId(null)}>
          <IconArrowLeft size={14} stroke={1.75} /> 강좌 목록으로
        </button>
        <div className="row-between">
          <div>
            <h2 className="t-h2">
              <span className="badge-course-no" style={{ marginRight: 8 }}>{pad2(openCourse.course_no)}</span>
              {openCourse.title}
            </h2>
            <p className="t-muted-sm tnum mt-8">
              제출 {submitted.length} / 전체 {students.length} (달성율 {pct}%)
              {openCourse.assignment_due && ` · 마감일 ${fmtDate(openCourse.assignment_due, true)}`}
            </p>
          </div>
          <button className="btn btn-white btn-sm" onClick={exportCourseCsv}>
            <IconFileSpreadsheet size={14} stroke={1.75} /> CSV 내보내기
          </button>
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${pct === 100 ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="table-wrap" style={{ maxHeight: '65vh' }}>
          <table className="data-table">
            <thead>
              <tr><th>성명</th><th>소속</th><th>상태</th><th>제출 일시</th><th>제출물</th></tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const sub = subMap[`${st.id}:${openCourse.id}`]
                return (
                  <tr key={st.id}>
                    <td className="t-emph">{st.name}</td>
                    <td className="t-muted-sm">{st.org}</td>
                    <td>{sub ? <StatusPill kind="done">제출됨</StatusPill> : <StatusPill kind="open">미제출</StatusPill>}</td>
                    <td className="tnum">{sub ? fmtDate(sub.submitted_at, true) : '-'}</td>
                    <td>
                      {sub ? (
                        <button className="btn btn-text" onClick={() => setDetail({ sub, student: st, course: openCourse })}>
                          {sub.type === 'file' ? sub.original_filename : 'URL 보기'}
                        </button>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Dialog open={!!detail} title="제출물 상세" onClose={() => setDetail(null)}
          actions={<button className="btn btn-primary btn-sm" onClick={() => setDetail(null)}>닫기</button>}>
          {detail && (
            <div className="stack" style={{ gap: 8 }}>
              <div><span className="t-label muted">학생</span><div className="t-emph" style={{ color: 'var(--foreground)' }}>{detail.student.name} ({detail.student.org})</div></div>
              <div><span className="t-label muted">강좌</span><div style={{ color: 'var(--foreground)' }}>{pad2(detail.course.course_no)}. {detail.course.title}</div></div>
              <div><span className="t-label muted">제출 일시</span><div className="tnum" style={{ color: 'var(--foreground)' }}>{fmtDate(detail.sub.submitted_at, true)}</div></div>
              {detail.sub.type === 'file' ? (
                <button className="btn btn-white btn-sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => downloadFile('submissions', detail.sub.file_path, `${pad2(detail.course.course_no)}_${detail.student.name}_${detail.sub.original_filename}`)
                    .catch(() => toast('다운로드 실패', 'error'))}>
                  <IconDownload size={14} stroke={1.75} /> {detail.sub.original_filename} ({fmtBytes(detail.sub.file_size)})
                </button>
              ) : (
                <a href={detail.sub.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
                  <IconExternalLink size={14} stroke={1.75} /> {detail.sub.url}
                </a>
              )}
            </div>
          )}
        </Dialog>
      </div>
    )
  }

  /* ---------- 강좌별 카드 목록 ---------- */
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h2 className="t-h2">과제 제출 현황 <span className="t-muted-sm">— {selected?.name}</span></h2>
        <button className="btn btn-white btn-sm" onClick={exportAllCsv}>
          <IconFileSpreadsheet size={14} stroke={1.75} /> 전체 CSV 내보내기
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {courses.map((c) => {
          const cnt = students.filter((st) => subMap[`${st.id}:${c.id}`]).length
          const pct = students.length ? Math.round((cnt / students.length) * 100) : 0
          return (
            <div key={c.id} className="card-course" onClick={() => setOpenCourseId(c.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setOpenCourseId(c.id)}>
              <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
              <div className="row-between mb-8">
                <span className="badge-course-no">{pad2(c.course_no)}</span>
                <span className="pill pill-neutral"><IconClipboardText size={12} stroke={1.75} /> 과제</span>
              </div>
              <div className="t-h3 mb-8">{c.title}</div>
              <div className="t-stat tnum mb-8" style={{ color: 'var(--primary)' }}>
                제출 {cnt} / 전체 {students.length} <span className="t-label muted">(달성율 {pct}%)</span>
              </div>
              <div className="progress-track mb-8">
                <div className={`progress-fill ${pct === 100 ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              {c.assignment_due && (
                <div className="t-caption muted-soft tnum">마감일 {fmtDate(c.assignment_due, true)}</div>
              )}
            </div>
          )
        })}
      </div>
      <p className="t-caption muted-soft">카드를 클릭하면 인원별 제출 현황을 확인할 수 있습니다.</p>
    </div>
  )
}
