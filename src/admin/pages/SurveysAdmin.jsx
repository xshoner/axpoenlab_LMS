import { useEffect, useState } from 'react'
import {
  IconPlus, IconTrash, IconCopy, IconArrowUp, IconArrowDown, IconChartBar,
  IconPencil, IconFileSpreadsheet, IconEye,
} from '@tabler/icons-react'
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, Dialog, Donut, EmptyState, HBar, Loading, StatusPill, useToast } from '../../shared/ui'
import { pad2, downloadCsv, CONTENT_STATUS } from '../../lib/helpers'

const Q_TYPES = { choice: '선다형', short: '단답형', long: '장문형', grid: '그리드형' }
const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']
// 원형 그래프 팔레트 — 흰 배경 기준 색각 이상(CVD) 분리도 검증 통과 순서, 순서 고정
const PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

export default function SurveysAdmin() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [scope, setScope] = useState('cohort') // cohort | master
  const [view, setView] = useState({ mode: 'list' }) // list | builder | stats
  const [rows, setRows] = useState(null)
  const [courses, setCourses] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const isMaster = scope === 'master'

  async function load() {
    if (isMaster) {
      const { data: cs } = await supabase.from('master_courses').select('id, title').order('sort_order')
      setCourses(cs || [])
      const ids = (cs || []).map((c) => c.id)
      if (!ids.length) { setRows([]); return }
      const { data } = await supabase.from('surveys')
        .select('*, master_courses(title), survey_questions(id), survey_responses(id)')
        .in('master_course_id', ids).order('created_at', { ascending: false })
      setRows(data || [])
      return
    }
    if (!selectedId) { setRows([]); setCourses([]); return }
    const { data: cs } = await supabase.from('cohort_courses').select('id, course_no, title')
      .eq('cohort_id', selectedId).order('course_no')
    setCourses(cs || [])
    const ids = (cs || []).map((c) => c.id)
    if (!ids.length) { setRows([]); return }
    const { data } = await supabase.from('surveys')
      .select('*, cohort_courses(course_no, title), survey_questions(id), survey_responses(id)')
      .in('cohort_course_id', ids).order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load(); setView({ mode: 'list' }) }, [selectedId, scope])

  async function setStatus(survey, status) {
    if (status === 'open' && (survey.survey_questions || []).length === 0) {
      toast('문항이 없는 설문은 공개할 수 없습니다.', 'error')
      return
    }
    const { error } = await supabase.from('surveys').update({ status }).eq('id', survey.id)
    if (error) toast('상태 변경 실패', 'error')
    else { toast(`설문이 '${CONTENT_STATUS[status]}' 상태로 변경되었습니다.`); load() }
  }

  async function remove() {
    const { error } = await supabase.from('surveys').delete().eq('id', deleteTarget.id)
    if (error) toast('삭제 실패', 'error')
    else { toast('설문이 삭제되었습니다.'); setDeleteTarget(null); load() }
  }

  if (view.mode === 'builder') {
    return <SurveyBuilder surveyId={view.id} courses={courses} isMaster={isMaster} onDone={() => { setView({ mode: 'list' }); load() }} />
  }
  if (view.mode === 'stats') {
    return <SurveyStats surveyId={view.id} cohortId={selectedId} onBack={() => setView({ mode: 'list' })} />
  }

  const scopeTabs = (
    <div className="row" style={{ gap: 8 }}>
      <button className={`btn btn-sm ${!isMaster ? 'btn-primary' : 'btn-white'}`} onClick={() => setScope('cohort')}>기수별 설문</button>
      <button className={`btn btn-sm ${isMaster ? 'btn-primary' : 'btn-white'}`} onClick={() => setScope('master')}>마스터 강좌 설문</button>
    </div>
  )

  if (!isMaster && !selectedId) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        {scopeTabs}
        <EmptyState title="기수를 선택해 주세요" description="상단에서 기수를 선택하면 해당 기수의 설문이 표시됩니다." />
      </div>
    )
  }
  if (!rows) return <Loading />

  return (
    <div className="stack" style={{ gap: 16 }}>
      {scopeTabs}
      <div className="row-between">
        <h2 className="t-h2">설문 관리 <span className="t-muted-sm">— {isMaster ? '마스터 강좌 라이브러리' : selected?.name}</span></h2>
        <button className="btn btn-primary btn-sm" onClick={() => setView({ mode: 'builder', id: null })} disabled={courses.length === 0}>
          <IconPlus size={14} stroke={1.75} /> 새 설문
        </button>
      </div>
      {isMaster && <p className="t-muted-sm">마스터 강좌에 연결한 설문 템플릿입니다. 기수 배정 시 문항 구성이 함께 복제되며, 복제본은 기수별 설문에서 따로 관리합니다.</p>}
      {rows.length === 0 ? (
        <EmptyState title="아직 등록된 설문이 없습니다"
          description={isMaster ? '마스터 강좌에 연결할 설문 템플릿을 만들어 보세요.' : '강좌에 연결할 설문을 만들어 보세요.'}
          action={courses.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => setView({ mode: 'builder', id: null })}>설문 만들기</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>연결 강좌</th><th>문항</th><th>응답</th><th>상태</th><th style={{ width: 330 }}>작업</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="t-emph">{s.title}</td>
                  <td className="t-muted-sm">
                    {s.cohort_courses ? `${pad2(s.cohort_courses.course_no)}. ${s.cohort_courses.title}` : s.master_courses?.title || '-'}
                  </td>
                  <td className="tnum">{(s.survey_questions || []).length}</td>
                  <td className="tnum">{isMaster ? '-' : (s.survey_responses || []).length}</td>
                  <td>
                    {isMaster
                      ? <StatusPill kind="neutral">템플릿</StatusPill>
                      : <StatusPill kind={s.status === 'open' ? 'open' : s.status === 'closed' ? 'closed' : 'neutral'}>{CONTENT_STATUS[s.status]}</StatusPill>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-white btn-sm" onClick={() => setView({ mode: 'builder', id: s.id })}><IconPencil size={14} stroke={1.75} /> 편집</button>
                      {!isMaster && <button className="btn btn-white btn-sm" onClick={() => setView({ mode: 'stats', id: s.id })}><IconChartBar size={14} stroke={1.75} /> 통계</button>}
                      {!isMaster && s.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => setStatus(s, 'open')}>공개</button>}
                      {!isMaster && s.status === 'open' && <button className="btn btn-danger btn-sm" onClick={() => setStatus(s, 'closed')}>마감</button>}
                      {!isMaster && s.status === 'closed' && <button className="btn btn-white btn-sm" onClick={() => setStatus(s, 'open')}>재공개</button>}
                      <button className="icon-btn danger" onClick={() => setDeleteTarget(s)}><IconTrash size={16} stroke={1.75} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} danger title="설문 삭제"
        message={`'${deleteTarget?.title}' 설문과 모든 응답 데이터가 삭제됩니다. 계속하시겠습니까?`}
        confirmLabel="삭제" onConfirm={remove} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}

/* ============ 설문 빌더 ============ */
function SurveyBuilder({ surveyId, courses, isMaster, onDone }) {
  const toast = useToast()
  const linkKey = isMaster ? 'master_course_id' : 'cohort_course_id'
  const [survey, setSurvey] = useState(surveyId ? null : {
    title: '', description: '', [linkKey]: courses[0]?.id || '', status: 'draft', allow_edit: false,
  })
  const [questions, setQuestions] = useState(surveyId ? null : [])
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!surveyId) return
    ;(async () => {
      const [sQ, qQ] = await Promise.all([
        supabase.from('surveys').select('*').eq('id', surveyId).single(),
        supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_no'),
      ])
      setSurvey(sQ.data)
      setQuestions(qQ.data || [])
    })()
  }, [surveyId])

  if (!survey || !questions) return <Loading />

  function newQuestion(type = 'choice') {
    return {
      _localId: Math.random().toString(36).slice(2),
      type, text: '', required: false, options: ['보기 1', '보기 2'],
      multiple: false, has_other: false,
      grid_rows: ['항목 1'], grid_cols: ['1', '2', '3', '4', '5'], max_length: null,
    }
  }

  function updateQ(i, patch) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }
  function moveQ(i, dir) {
    const j = i + dir
    if (j < 0 || j >= questions.length) return
    setQuestions((qs) => {
      const next = [...qs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    if (!survey.title.trim()) { toast('설문 제목을 입력해 주세요.', 'error'); return }
    if (!survey[linkKey]) { toast('연결 강좌를 선택해 주세요.', 'error'); return }
    setBusy(true)
    try {
      // 메타+문항을 DB 함수 하나로 원자적 저장 — 중간 실패 시 기존 문항이 보존된다
      const meta = {
        title: survey.title.trim(), description: survey.description,
        [linkKey]: survey[linkKey], allow_edit: survey.allow_edit,
      }
      const rows = questions.map((q) => ({
        type: q.type, required: q.required, text: q.text,
        options: q.type === 'choice' ? q.options : [],
        multiple: q.multiple, has_other: q.has_other,
        grid_rows: q.type === 'grid' ? q.grid_rows : [],
        grid_cols: q.type === 'grid' ? q.grid_cols : [],
        max_length: q.max_length || null,
      }))
      const { error } = await supabase.rpc('save_survey', {
        p_survey_id: surveyId || null, p_meta: meta, p_questions: rows,
      })
      if (error) throw error
      toast('설문이 저장되었습니다.')
      onDone()
    } catch {
      toast('저장에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 0, maxWidth: 860 }}>
      <div className="toolbar-sticky">
        <span className="t-caption muted">{surveyId ? '설문 편집' : '새 설문'}</span>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-white btn-sm" onClick={() => setPreview(true)}><IconEye size={14} stroke={1.75} /> 미리보기</button>
          <button className="btn btn-white btn-sm" onClick={onDone}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>

      <div className="card-panel mb-16">
        <div className="field">
          <label>설문 제목 <span className="req">*</span></label>
          <input className="input" value={survey.title} onChange={(e) => setSurvey({ ...survey, title: e.target.value })} />
        </div>
        <div className="field">
          <label>안내문</label>
          <textarea className="textarea" style={{ minHeight: 80 }} value={survey.description}
            onChange={(e) => setSurvey({ ...survey, description: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>연결 강좌 <span className="req">*</span></label>
            <select className="select" value={survey[linkKey] || ''}
              onChange={(e) => setSurvey({ ...survey, [linkKey]: e.target.value })}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{isMaster ? c.title : `${pad2(c.course_no)}. ${c.title}`}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>재응답 허용</label>
            <div className="checkbox-row" style={{ height: 48 }}>
              <input id="allowEdit" type="checkbox" checked={survey.allow_edit}
                onChange={(e) => setSurvey({ ...survey, allow_edit: e.target.checked })} />
              <label htmlFor="allowEdit">학습자가 제출 후 응답을 수정할 수 있습니다</label>
            </div>
          </div>
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id || q._localId} className="builder-block">
          <div className="row mb-16" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="t-micro muted">Q{i + 1}</span>
            <select className="select-sm" style={{ height: 36 }} value={q.type}
              onChange={(e) => updateQ(i, { type: e.target.value })}>
              {Object.entries(Q_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="checkbox-row"><input type="checkbox" checked={q.required} onChange={(e) => updateQ(i, { required: e.target.checked })} /> 필수</label>
            <div className="row" style={{ gap: 2, marginLeft: 'auto' }}>
              <button className="icon-btn" onClick={() => moveQ(i, -1)} disabled={i === 0}><IconArrowUp size={16} stroke={1.75} /></button>
              <button className="icon-btn" onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1}><IconArrowDown size={16} stroke={1.75} /></button>
              <button className="icon-btn" title="복제" onClick={() => setQuestions((qs) => [...qs.slice(0, i + 1), { ...q, id: undefined, _localId: Math.random().toString(36).slice(2) }, ...qs.slice(i + 1)])}>
                <IconCopy size={16} stroke={1.75} />
              </button>
              <button className="icon-btn danger" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}>
                <IconTrash size={16} stroke={1.75} />
              </button>
            </div>
          </div>
          <input className="input mb-16" placeholder="문항 내용을 입력하세요" value={q.text} onChange={(e) => updateQ(i, { text: e.target.value })} />

          {q.type === 'choice' && (
            <div className="stack" style={{ gap: 8 }}>
              {q.options.map((opt, oi) => (
                <div key={oi} className="row">
                  <input className="input" style={{ height: 40 }} value={opt} placeholder={`보기 ${oi + 1}`}
                    onFocus={(e) => {
                      if (/^보기 \d+$/.test(e.target.value.trim())) updateQ(i, { options: q.options.map((o, x) => (x === oi ? '' : o)) })
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) updateQ(i, { options: q.options.map((o, x) => (x === oi ? `보기 ${oi + 1}` : o)) })
                    }}
                    onChange={(e) => updateQ(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })} />
                  <button className="icon-btn danger" disabled={q.options.length <= 2}
                    onClick={() => updateQ(i, { options: q.options.filter((_, x) => x !== oi) })}>
                    <IconTrash size={16} stroke={1.75} />
                  </button>
                </div>
              ))}
              <div className="row" style={{ gap: 16 }}>
                <button className="btn btn-text" onClick={() => updateQ(i, { options: [...q.options, `보기 ${q.options.length + 1}`] })}>+ 보기 추가</button>
                <label className="checkbox-row"><input type="checkbox" checked={q.multiple} onChange={(e) => updateQ(i, { multiple: e.target.checked })} /> 복수 선택 허용</label>
                <label className="checkbox-row"><input type="checkbox" checked={q.has_other} onChange={(e) => updateQ(i, { has_other: e.target.checked })} /> '기타' 직접입력</label>
              </div>
            </div>
          )}

          {(q.type === 'short' || q.type === 'long') && (
            <div className="row">
              <label className="t-label muted">글자 수 제한 (선택)</label>
              <input className="input" type="number" style={{ width: 120, height: 40 }} value={q.max_length || ''}
                onChange={(e) => updateQ(i, { max_length: e.target.value ? Number(e.target.value) : null })} />
            </div>
          )}

          {q.type === 'grid' && (
            <div className="grid-2">
              <div>
                <div className="t-label muted mb-8">행 (평가 항목)</div>
                {q.grid_rows.map((r, ri) => (
                  <div key={ri} className="row mb-8">
                    <input className="input" style={{ height: 36 }} value={r} placeholder={`항목 ${ri + 1}`}
                      onFocus={(e) => {
                        if (/^항목 \d+$/.test(e.target.value.trim())) updateQ(i, { grid_rows: q.grid_rows.map((x, y) => (y === ri ? '' : x)) })
                      }}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) updateQ(i, { grid_rows: q.grid_rows.map((x, y) => (y === ri ? `항목 ${ri + 1}` : x)) })
                      }}
                      onChange={(e) => updateQ(i, { grid_rows: q.grid_rows.map((x, y) => (y === ri ? e.target.value : x)) })} />
                    <button className="icon-btn danger" disabled={q.grid_rows.length <= 1}
                      onClick={() => updateQ(i, { grid_rows: q.grid_rows.filter((_, y) => y !== ri) })}>
                      <IconTrash size={14} stroke={1.75} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-text" onClick={() => updateQ(i, { grid_rows: [...q.grid_rows, `항목 ${q.grid_rows.length + 1}`] })}>+ 행 추가</button>
              </div>
              <div>
                <div className="t-label muted mb-8">열 (척도 라벨)</div>
                {q.grid_cols.map((c, ci) => (
                  <div key={ci} className="row mb-8">
                    <input className="input" style={{ height: 36 }} value={c}
                      onChange={(e) => updateQ(i, { grid_cols: q.grid_cols.map((x, y) => (y === ci ? e.target.value : x)) })} />
                    <button className="icon-btn danger" disabled={q.grid_cols.length <= 2}
                      onClick={() => updateQ(i, { grid_cols: q.grid_cols.filter((_, y) => y !== ci) })}>
                      <IconTrash size={14} stroke={1.75} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-text" onClick={() => updateQ(i, { grid_cols: [...q.grid_cols, String(q.grid_cols.length + 1)] })}>+ 열 추가</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {Object.entries(Q_TYPES).map(([k, v]) => (
          <button key={k} className="btn btn-white btn-sm" onClick={() => setQuestions((qs) => [...qs, newQuestion(k)])}>
            <IconPlus size={14} stroke={1.75} /> {v}
          </button>
        ))}
      </div>

      <Dialog open={preview} title="미리보기 (학습자 화면)" onClose={() => setPreview(false)}
        actions={<button className="btn btn-primary btn-sm" onClick={() => setPreview(false)}>닫기</button>}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="t-h2 mb-8" style={{ color: 'var(--foreground)' }}>{survey.title || '(제목 없음)'}</div>
          {survey.description && <p className="t-muted-sm mb-16" style={{ whiteSpace: 'pre-wrap' }}>{survey.description}</p>}
          {questions.map((q, i) => (
            <div key={q.id || q._localId} className="question-card" style={{ padding: 16 }}>
              <div className="t-micro muted mb-8">Q{i + 1} {q.required && <span style={{ color: 'var(--danger)' }}>*</span>}</div>
              <div className="t-h3 mb-8" style={{ color: 'var(--foreground)' }}>{q.text || '(문항 없음)'}</div>
              {q.type === 'choice' && q.options.map((o, oi) => <div key={oi} className="choice-row" style={{ minHeight: 40, padding: '8px 12px' }}>{q.multiple ? '☐' : '○'} {o}</div>)}
              {q.type === 'short' && <input className="input" disabled placeholder="한 줄 입력" />}
              {q.type === 'long' && <textarea className="textarea" disabled style={{ minHeight: 60 }} placeholder="여러 줄 입력" />}
              {q.type === 'grid' && <div className="t-caption muted-soft">{q.grid_rows.length}행 × {q.grid_cols.length}열 매트릭스</div>}
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  )
}

/* ============ 설문 통계 ============ */
function SurveyStats({ surveyId, cohortId, onBack }) {
  const [data, setData] = useState(null)
  const [anonymous, setAnonymous] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [sQ, qQ, rQ, mQ] = await Promise.all([
        supabase.from('surveys').select('*').eq('id', surveyId).single(),
        supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_no'),
        supabase.from('survey_responses').select('*, profiles(name, org), survey_answers(question_id, value)').eq('survey_id', surveyId),
        supabase.from('cohort_members').select('user_id, profiles(name, org)').eq('cohort_id', cohortId),
      ])
      if (!alive) return
      setData({ survey: sQ.data, questions: qQ.data || [], responses: rQ.data || [], members: mQ.data || [] })
    })()
    return () => { alive = false }
  }, [surveyId, cohortId])

  if (!data) return <Loading />
  const { survey, questions, responses, members } = data
  const total = members.length
  const answered = responses.length
  const respondedIds = new Set(responses.map((r) => r.user_id))
  const nonResponders = members.filter((m) => !respondedIds.has(m.user_id))

  function answersFor(qid) {
    return responses.map((r) => ({
      name: r.profiles?.name || '', org: r.profiles?.org || '',
      value: (r.survey_answers || []).find((a) => a.question_id === qid)?.value,
    })).filter((a) => a.value != null)
  }

  function exportCsv() {
    const header = ['성명', '소속', ...questions.map((q, i) => `Q${i + 1}. ${q.text}`)]
    const rows = responses.map((r) => [
      r.profiles?.name, r.profiles?.org,
      ...questions.map((q) => {
        const v = (r.survey_answers || []).find((a) => a.question_id === q.id)?.value
        if (v == null) return ''
        if (q.type === 'choice') {
          const sel = (v.sel || []).map((i) => (i === -1 ? `기타: ${v.other || ''}` : q.options?.[i])).join('; ')
          return sel
        }
        if (q.type === 'grid') return Object.entries(v).map(([ri, ci]) => `${q.grid_rows?.[ri]}=${q.grid_cols?.[ci]}`).join('; ')
        return String(v)
      }),
    ])
    downloadCsv(`설문응답_${survey.title}.csv`, [header, ...rows])
  }

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 960 }}>
      <div className="row-between">
        <h2 className="t-h2">{survey.title} — 응답 통계</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={exportCsv}><IconFileSpreadsheet size={14} stroke={1.75} /> CSV 내보내기</button>
          <button className="btn btn-white btn-sm" onClick={onBack}>목록으로</button>
        </div>
      </div>

      <div className="card-panel row" style={{ gap: 32, flexWrap: 'wrap' }}>
        <Donut value={answered} total={total} label="응답" />
        <div>
          <div className="t-stat-lg tnum" style={{ color: 'var(--primary)' }}>전체 {total}명 / 응답 {answered}명</div>
          <div className="t-muted-sm mt-8">미응답 {nonResponders.length}명</div>
          {nonResponders.length > 0 && (
            <details className="mt-8">
              <summary className="btn-text btn" style={{ cursor: 'pointer' }}>미응답자 명단 보기</summary>
              <div className="t-muted-sm mt-8">{nonResponders.map((m) => m.profiles?.name).join(', ')}</div>
            </details>
          )}
        </div>
      </div>

      {questions.map((q, i) => {
        const answers = answersFor(q.id)
        return (
          <div key={q.id} className="chart-panel">
            <div className="t-micro muted mb-8">Q{i + 1} · {Q_TYPES[q.type]} · 응답 {answers.length}건</div>
            <h3 className="t-h3 mb-16">{q.text}</h3>

            {q.type === 'choice' && (() => {
              // 항목별 응답 수 집계 후 높은 순으로 정렬 — 색은 정렬과 무관하게 원래 보기 순서에 고정
              const others = q.has_other ? answers.filter((a) => (a.value.sel || []).includes(-1)) : []
              const items = (q.options || []).map((opt, oi) => ({
                label: opt,
                count: answers.filter((a) => (a.value.sel || []).includes(oi)).length,
                color: PIE_COLORS[oi % PIE_COLORS.length],
              }))
              if (q.has_other) items.push({ label: '기타', count: others.length, color: PIE_COLORS[(q.options || []).length % PIE_COLORS.length], isOther: true })
              items.sort((a, b) => b.count - a.count)
              // 단일 선택(중복 미허용)만 원형 그래프 — 조각이 팔레트보다 많으면 막대로 대체
              const usePie = !q.multiple && answers.length > 0 && items.length <= PIE_COLORS.length
              return (
                <div>
                  {usePie ? (
                    <ChoicePie items={items} total={answers.length} />
                  ) : (
                    items.map((it, x) => (
                      <HBar key={x} label={it.label} count={it.count} total={answers.length || 1}
                        color={it.isOther ? 'var(--chart-2)' : undefined} />
                    ))
                  )}
                  {others.length > 0 && (
                    <div className="t-caption muted-soft mt-8">
                      {others.map((o, x) => <div key={x}>· 기타: {o.value.other}</div>)}
                    </div>
                  )}
                </div>
              )
            })()}

            {(q.type === 'short' || q.type === 'long') && (
              <div>
                <label className="checkbox-row mb-8">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> 익명으로 보기
                </label>
                {answers.length === 0 ? <div className="t-muted-sm">응답이 없습니다.</div> : (
                  <div className="stack" style={{ gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                    {answers.map((a, x) => (
                      <div key={x} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
                        <span className="t-body">{String(a.value)}</span>
                        {!anonymous && <span className="t-caption muted-soft" style={{ marginLeft: 8 }}>— {a.name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {q.type === 'grid' && (() => {
              const rows = q.grid_rows || []
              const cols = q.grid_cols || []
              const counts = rows.map((_, ri) => cols.map((_, ci) =>
                answers.filter((a) => Number(a.value?.[ri]) === ci).length))
              const maxCount = Math.max(1, ...counts.flat())
              return (
                <div style={{ overflowX: 'auto' }}>
                  {/* table-layout: fixed — 행 텍스트가 길어도 열(척도) 폭을 침범하지 못하고 줄바꿈된다 */}
                  <table className="data-table" style={{ minWidth: 480, width: '100%', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30%' }}></th>
                        {cols.map((c, ci) => (
                          <th key={ci} style={{ textAlign: 'center', whiteSpace: 'normal', wordBreak: 'keep-all', verticalAlign: 'middle' }}>{c}</th>
                        ))}
                        <th style={{ textAlign: 'center', width: 64 }}>평균</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => {
                        const rowTotal = counts[ri].reduce((a, b) => a + b, 0)
                        const avg = rowTotal ? (counts[ri].reduce((s, c, ci) => s + c * (ci + 1), 0) / rowTotal).toFixed(1) : '-'
                        return (
                          <tr key={ri}>
                            <td className="t-label" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{r}</td>
                            {cols.map((_, ci) => {
                              const cnt = counts[ri][ci]
                              const level = Math.min(4, Math.round((cnt / maxCount) * 4))
                              const pct = rowTotal ? Math.round((cnt / rowTotal) * 100) : 0
                              return (
                                <td key={ci} className="grid-heat-cell tnum"
                                  style={{ background: HEAT[level], color: level >= 4 ? 'var(--on-primary)' : 'var(--foreground)' }}>
                                  {cnt} · {pct}%
                                </td>
                              )
                            })}
                            <td className="tnum" style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 600 }}>{avg}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}

/* ============ 단일 선택 선다형 원형 그래프 ============ */
const RAD = Math.PI / 180

// 조각 밝기에 따라 안쪽 % 라벨 잉크 색 선택
function sliceInk(hex) {
  const n = parseInt(hex.slice(1), 16)
  const yiq = (((n >> 16) & 255) * 299 + (((n >> 8) & 255)) * 587 + (n & 255) * 114) / 1000
  return yiq >= 150 ? '#0f1419' : '#ffffff'
}

function ChoicePie({ items, total }) {
  const data = items.filter((it) => it.count > 0)
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
    if (percent < 0.05) return null // 좁은 조각은 라벨 생략 — 범례·툴팁이 대신한다
    const r = innerRadius + (outerRadius - innerRadius) * 0.6
    const x = cx + r * Math.cos(-midAngle * RAD)
    const y = cy + r * Math.sin(-midAngle * RAD)
    return (
      <text x={x} y={y} fill={sliceInk(data[index].color)} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 13, fontWeight: 700 }}>
        {Math.round(percent * 100)}%
      </text>
    )
  }
  return (
    <div className="row" style={{ gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ width: 240, height: 240, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={112}
              labelLine={false} label={renderLabel} isAnimationActive={false}
              stroke="var(--background)" strokeWidth={2}>
              {data.map((it, x) => <Cell key={x} fill={it.color} />)}
            </Pie>
            <RTooltip
              formatter={(v, name) => [`${v}명 (${total ? Math.round((v / total) * 100) : 0}%)`, name]}
              contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, maxWidth: 320, whiteSpace: 'normal' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="stack" style={{ gap: 8, flex: 1, minWidth: 240 }}>
        {items.map((it, x) => (
          <div key={x} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: it.color, flexShrink: 0, marginTop: 4 }} />
            <span className="t-muted-sm" style={{ flex: 1, overflowWrap: 'anywhere' }}>{it.label}</span>
            <span className="t-label tnum" style={{ flexShrink: 0 }}>
              {it.count}명 · {total ? Math.round((it.count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
