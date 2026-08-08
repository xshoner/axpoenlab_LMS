import { useEffect, useState } from 'react'
import { IconDownload, IconFileSpreadsheet, IconExternalLink } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { Dialog, EmptyState, Loading, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, pad2, downloadFile, downloadCsv } from '../../lib/helpers'

export default function AssignmentMatrix() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!selectedId) { setData(null); return }
    let alive = true
    ;(async () => {
      setData(undefined)
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

  function exportCsv() {
    const header = ['성명', '소속', ...courses.map((c) => `${pad2(c.course_no)}. ${c.title}`)]
    const rows = students.map((st) => [
      st.name, st.org,
      ...courses.map((c) => (subMap[`${st.id}:${c.id}`] ? '제출' : '미제출')),
    ])
    downloadCsv(`과제제출현황_${selected?.name || ''}.csv`, [header, ...rows])
  }

  if (courses.length === 0) return <EmptyState title="과제가 설정된 강좌가 없습니다" description="강좌 관리에서 과제를 활성화해 주세요." />

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h2 className="t-h2">과제 제출 현황 <span className="t-muted-sm">— {selected?.name}</span></h2>
        <button className="btn btn-white btn-sm" onClick={exportCsv}>
          <IconFileSpreadsheet size={14} stroke={1.75} /> CSV 내보내기
        </button>
      </div>
      <div className="table-wrap" style={{ maxHeight: '70vh' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky-col">성명</th>
              <th>소속</th>
              {courses.map((c) => (
                <th key={c.id} style={{ textAlign: 'center' }} title={c.title}>{pad2(c.course_no)}</th>
              ))}
              <th style={{ textAlign: 'center' }}>제출률</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const cnt = courses.filter((c) => subMap[`${st.id}:${c.id}`]).length
              return (
                <tr key={st.id}>
                  <td className="sticky-col t-emph">{st.name}</td>
                  <td className="t-muted-sm">{st.org}</td>
                  {courses.map((c) => {
                    const sub = subMap[`${st.id}:${c.id}`]
                    return (
                      <td key={c.id}
                        className={`matrix-cell ${sub ? 'submitted' : 'missing'}`}
                        style={{ cursor: sub ? 'pointer' : 'default' }}
                        title={sub ? `${st.name} · ${pad2(c.course_no)}강 · ${fmtDate(sub.submitted_at, true)} · ${sub.type === 'file' ? '파일' : 'URL'}` : `${st.name} · ${pad2(c.course_no)}강 · 미제출`}
                        onClick={() => sub && setDetail({ sub, student: st, course: c })}
                      >
                        {sub ? '●' : '○'}
                      </td>
                    )
                  })}
                  <td className="tnum" style={{ textAlign: 'center' }}>{cnt} / {courses.length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="t-caption muted-soft">● 제출됨 · ○ 미제출 — 셀을 클릭하면 제출물을 확인할 수 있습니다.</p>

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
