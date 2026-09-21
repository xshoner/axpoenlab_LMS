import { useEffect, useState } from 'react'
import {
  IconEye, IconPaperclip, IconChecklist, IconPencilQuestion, IconBook2, IconBulb, IconRocket,
  IconChartDots, IconPuzzle, IconTargetArrow, IconArrowLeft, IconDownload, IconExternalLink, IconFile,
  IconEyeOff, IconChevronLeft, IconChevronRight,
} from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { Loading, EmptyState, StatusPill, useToast } from '../../shared/ui'
import RichBody from '../../shared/RichBody'
import { pad2, fmtBytes, fmtDate, downloadFile } from '../../lib/helpers'

const THEME_ICONS = [IconBook2, IconBulb, IconRocket, IconChartDots, IconPuzzle, IconTargetArrow]

/* 학생 화면 미리보기 — 선택한 기수의 학생에게 실제로 보이는 강좌·설문·퀴즈·과제를
   학생 화면과 같은 레이아웃으로 렌더링한다. 권한을 바꾸는 것이 아니라 관리자 권한으로 읽기만 하며,
   열람 기록·응답·별점은 남지 않는다. 학생에게 숨겨지는 항목(초안)은 회색으로 표시한다. */
export default function StudentPreview() {
  const { selectedId, selected } = useCohort()
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [rows, setRows] = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!selectedId) { setGroups([]); setRows([]); return }
    let alive = true
    setGroups(null); setRows(null); setOpenId(null)
    supabase.from('cohort_course_groups').select('id, name, sort_order, is_default')
      .eq('cohort_id', selectedId).eq('is_published', true).order('sort_order')
      .then(({ data }) => {
        if (!alive) return
        const next = data || []
        setGroups(next)
        setGroupId(next.find((group) => group.is_default)?.id || next[0]?.id || '')
      })
    return () => { alive = false }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !groupId) { if (groups) setRows([]); return }
    let alive = true
    setRows(null); setOpenId(null)
    supabase.from('cohort_courses')
      .select('*, cohort_attachments(*), surveys(id, title, status, allow_edit), quizzes(id, title, status, reveal_answers)')
      .eq('cohort_id', selectedId).eq('group_id', groupId).order('course_no')
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [selectedId, groupId])

  if (!selectedId) {
    return (
      <EmptyState icon={IconEye} title="기수를 선택해 주세요"
        description="상단의 기수 선택 드롭다운에서 기수를 고르면 그 기수 학생에게 보이는 화면을 미리 볼 수 있습니다." />
    )
  }
  if (!groups || !rows) return <Loading />

  const current = rows.find((r) => r.id === openId)

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="preview-banner">
        <IconEye size={18} stroke={1.75} />
        <div style={{ flex: 1 }}>
          <div className="t-label">학생 화면 미리보기 — {selected?.name}</div>
          <div className="t-caption" style={{ opacity: 0.85 }}>
            학생에게 공개되는 강좌·설문·퀴즈·과제를 학생 화면 레이아웃으로 표시합니다. 관리자 권한으로 읽기만 하므로 열람 기록·응답이 남지 않습니다.
            <span style={{ marginLeft: 6 }}><IconEyeOff size={12} stroke={1.75} style={{ verticalAlign: -2 }} /> 표시 항목은 초안 상태로 학생에게 보이지 않는 항목입니다.</span>
          </div>
        </div>
        {current && (
          <button className="btn btn-white btn-sm" onClick={() => setOpenId(null)}>
            <IconArrowLeft size={14} stroke={1.75} /> 강좌 목록
          </button>
        )}
      </div>

      {groups.length > 0 && <div className="student-course-group-picker">
        <div><div className="t-caption muted-soft">강좌 그룹</div><div className="t-h2">{groups.find((group) => group.id === groupId)?.name}</div></div>
        <select className="select" value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="미리보기 강좌 그룹 선택">
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </div>}

      <div className="preview-frame">
        {current
          ? <PreviewDetail course={current} siblings={rows} onNav={setOpenId} />
          : <PreviewList rows={rows} onOpen={setOpenId} />}
      </div>
    </div>
  )
}

function PreviewList({ rows, onOpen }) {
  if (rows.length === 0) {
    return <EmptyState title="배정된 강좌가 없습니다" description="학생 화면에는 '기수에 배정되면 강좌가 표시됩니다'라고 안내됩니다." />
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {rows.map((c, idx) => {
        const surveyCount = (c.surveys || []).filter((s) => s.status !== 'draft').length
        const quizCount = (c.quizzes || []).filter((q) => q.status !== 'draft').length
        const draftCount = (c.surveys || []).filter((s) => s.status === 'draft').length + (c.quizzes || []).filter((q) => q.status === 'draft').length
        const theme = ((Number(c.course_no) || idx + 1) - 1) % 6
        const ThemeIcon = THEME_ICONS[theme]
        return (
          <button key={c.id} type="button" onClick={() => onOpen(c.id)} className={`card-course theme-${theme}`}
            style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
            <span className="card-course-watermark" aria-hidden="true">{pad2(c.course_no)}</span>
            <div className="row-between mb-16">
              <div className="row" style={{ gap: 10 }}>
                <span className="card-course-icon"><ThemeIcon size={20} stroke={1.75} /></span>
                <span className="badge-course-no">{pad2(c.course_no)}</span>
              </div>
              <StatusPill kind="neutral">미열람</StatusPill>
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
              {c.assignment_enabled && <span className="pill pill-open"><span className="dot" />과제</span>}
              {draftCount > 0 && <span className="pill pill-neutral" title="초안 — 학생에게 보이지 않음" style={{ opacity: 0.6 }}><IconEyeOff size={12} stroke={1.75} /> 비공개 {draftCount}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PreviewDetail({ course, siblings, onNav }) {
  const toast = useToast()
  const idx = siblings.findIndex((s) => s.id === course.id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  const surveys = course.surveys || []
  const quizzes = course.quizzes || []
  const visibleSurveys = surveys.filter((s) => s.status !== 'draft')
  const visibleQuizzes = quizzes.filter((q) => q.status !== 'draft')

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
          {course.cohort_attachments.map((a) => (
            <div key={a.id} className="attachment-row">
              <IconFile size={18} stroke={1.75} color="var(--muted)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
              <span className="size">{fmtBytes(a.file_size)}</span>
              <button className="icon-btn" aria-label={`${a.filename} 다운로드`}
                onClick={() => downloadFile('course-files', a.file_path, a.filename).catch(() => toast('다운로드에 실패했습니다.', 'error'))}>
                <IconDownload size={18} stroke={1.75} />
              </button>
            </div>
          ))}
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
          <h2 className="t-h2 mb-16">설문 {visibleSurveys.length === 0 && <span className="t-caption muted-soft">(학생에게는 이 섹션이 보이지 않음)</span>}</h2>
          <div className="stack" style={{ gap: 12 }}>
            {surveys.map((s) => (
              <div key={s.id} className="row-between" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', opacity: s.status === 'draft' ? 0.55 : 1 }}>
                <div className="row" style={{ gap: 10 }}>
                  {s.status === 'draft' && <IconEyeOff size={14} stroke={1.75} />}
                  <span className="t-emph">{s.title}</span>
                  {s.status === 'closed' && <StatusPill kind="closed">마감</StatusPill>}
                  {s.status === 'draft' && <StatusPill kind="neutral">초안 · 학생 비공개</StatusPill>}
                </div>
                {s.status === 'open'
                  ? <span className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>설문 응답하기</span>
                  : s.status === 'closed' ? <span className="t-caption muted-soft">응답 기간 종료</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {quizzes.length > 0 && (
        <section className="card-panel">
          <h2 className="t-h2 mb-16">퀴즈 {visibleQuizzes.length === 0 && <span className="t-caption muted-soft">(학생에게는 이 섹션이 보이지 않음)</span>}</h2>
          <div className="stack" style={{ gap: 12 }}>
            {quizzes.map((q) => (
              <div key={q.id} className="row-between" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', opacity: q.status === 'draft' ? 0.55 : 1 }}>
                <div className="row" style={{ gap: 10 }}>
                  {q.status === 'draft' && <IconEyeOff size={14} stroke={1.75} />}
                  <span className="t-emph">{q.title}</span>
                  {q.status === 'closed' && <StatusPill kind="done">채점 완료</StatusPill>}
                  {q.status === 'draft' && <StatusPill kind="neutral">초안 · 학생 비공개</StatusPill>}
                </div>
                {q.status === 'open'
                  ? <span className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>퀴즈 응시하기</span>
                  : q.status === 'closed' ? <span className="t-caption muted-soft">응시 기간 종료 · 결과 보기</span> : null}
              </div>
            ))}
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
            <span className="btn btn-primary" style={{ pointerEvents: 'none' }}>과제 제출하러 가기</span>
          </div>
          <div style={{ background: 'var(--primary-tint)', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div className="t-h3 mb-8">과제 안내 <span className="t-caption muted-soft">(과제 제출 화면에 표시)</span></div>
            <div className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{course.assignment_text || '안내문이 없습니다.'}</div>
          </div>
        </section>
      )}

      <div className="row-between">
        {prev ? (
          <button className="btn btn-white" onClick={() => onNav(prev.id)}>
            <IconChevronLeft size={16} stroke={1.75} /> 이전 강좌
          </button>
        ) : <span />}
        {next ? (
          <button className="btn btn-white" onClick={() => onNav(next.id)}>
            다음 강좌 <IconChevronRight size={16} stroke={1.75} />
          </button>
        ) : <span />}
      </div>
    </div>
  )
}
