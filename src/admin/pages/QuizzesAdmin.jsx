import { useEffect, useState } from 'react'
import {
  IconPlus, IconTrash, IconCopy, IconArrowUp, IconArrowDown, IconChartBar,
  IconPencil, IconFileSpreadsheet, IconLock, IconRefresh,
} from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useCohort } from '../cohortContext'
import { ConfirmDialog, EmptyState, HBar, Loading, StatCard, StatusPill, useToast } from '../../shared/ui'
import { pad2, downloadCsv, CONTENT_STATUS } from '../../lib/helpers'

const Q_TYPES = { choice: '선다형', short: '단답형', ox: 'OX형' }

export default function QuizzesAdmin() {
  const { selectedId, selected } = useCohort()
  const toast = useToast()
  const [view, setView] = useState({ mode: 'list' })
  const [rows, setRows] = useState(null)
  const [courses, setCourses] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [closeTarget, setCloseTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedId) { setRows([]); setCourses([]); return }
    const { data: cs } = await supabase.from('cohort_courses').select('id, course_no, title')
      .eq('cohort_id', selectedId).order('course_no')
    setCourses(cs || [])
    const ids = (cs || []).map((c) => c.id)
    if (!ids.length) { setRows([]); return }
    const { data } = await supabase.from('quizzes')
      .select('*, cohort_courses(course_no, title), quiz_questions(id, answer), quiz_submissions(id)')
      .in('cohort_course_id', ids).order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load(); setView({ mode: 'list' }) }, [selectedId])

  function missingAnswers(quiz) {
    return (quiz.quiz_questions || []).some((q) => q.answer == null)
  }

  async function publish(quiz) {
    if ((quiz.quiz_questions || []).length === 0) { toast('문항이 없는 퀴즈는 공개할 수 없습니다.', 'error'); return }
    if (missingAnswers(quiz)) { toast('정답이 지정되지 않은 문항이 있어 공개할 수 없습니다.', 'error'); return }
    const { error } = await supabase.from('quizzes').update({ status: 'open' }).eq('id', quiz.id)
    if (error) toast('상태 변경 실패', 'error')
    else { toast('퀴즈가 공개되었습니다.'); load() }
  }

  async function closeAndGrade() {
    setBusy(true)
    const { data, error } = await supabase.rpc('grade_quiz', { p_quiz_id: closeTarget.id })
    setBusy(false)
    if (error || !data?.ok) {
      toast(data?.error === 'missing_answers' ? '정답 누락 문항이 있어 채점할 수 없습니다.' : '채점에 실패했습니다.', 'error')
      return
    }
    toast(`마감 완료 — ${data.graded}명의 답안이 자동채점되었습니다.`)
    setCloseTarget(null)
    load()
  }

  async function remove() {
    const { error } = await supabase.from('quizzes').delete().eq('id', deleteTarget.id)
    if (error) toast('삭제 실패', 'error')
    else { toast('퀴즈가 삭제되었습니다.'); setDeleteTarget(null); load() }
  }

  if (!selectedId) return <EmptyState title="기수를 선택해 주세요" description="상단에서 기수를 선택하면 해당 기수의 퀴즈가 표시됩니다." />
  if (!rows) return <Loading />

  if (view.mode === 'builder') {
    return <QuizBuilder quizId={view.id} courses={courses} onDone={() => { setView({ mode: 'list' }); load() }} />
  }
  if (view.mode === 'stats') {
    return <QuizStats quizId={view.id} cohortId={selectedId} onBack={() => setView({ mode: 'list' })} onRegrade={load} />
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h2 className="t-h2">퀴즈 관리 <span className="t-muted-sm">— {selected?.name}</span></h2>
        <button className="btn btn-primary btn-sm" onClick={() => setView({ mode: 'builder', id: null })} disabled={courses.length === 0}>
          <IconPlus size={14} stroke={1.75} /> 새 퀴즈
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="아직 등록된 퀴즈가 없습니다" description="강좌에 연결할 퀴즈를 만들어 보세요."
          action={courses.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => setView({ mode: 'builder', id: null })}>퀴즈 만들기</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>연결 강좌</th><th>문항</th><th>응시</th><th>상태</th><th style={{ width: 360 }}>작업</th></tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
                  <td className="t-emph">
                    {q.title}
                    {q.status === 'draft' && missingAnswers(q) && (
                      <div className="t-caption" style={{ color: 'var(--warning)' }}>정답을 지정해야 공개할 수 있습니다</div>
                    )}
                  </td>
                  <td className="t-muted-sm">{q.cohort_courses ? `${pad2(q.cohort_courses.course_no)}. ${q.cohort_courses.title}` : '-'}</td>
                  <td className="tnum">{(q.quiz_questions || []).length}</td>
                  <td className="tnum">{(q.quiz_submissions || []).length}</td>
                  <td>
                    <StatusPill kind={q.status === 'open' ? 'open' : q.status === 'closed' ? 'done' : 'neutral'}>
                      {q.status === 'closed' ? '마감·채점완료' : CONTENT_STATUS[q.status]}
                    </StatusPill>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {q.status !== 'closed' && (
                        <button className="btn btn-white btn-sm" onClick={() => setView({ mode: 'builder', id: q.id })}>
                          <IconPencil size={14} stroke={1.75} /> 편집
                        </button>
                      )}
                      <button className="btn btn-white btn-sm" onClick={() => setView({ mode: 'stats', id: q.id })}>
                        <IconChartBar size={14} stroke={1.75} /> 통계
                      </button>
                      {q.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => publish(q)} disabled={missingAnswers(q)}>공개</button>
                      )}
                      {q.status === 'open' && (
                        <button className="btn btn-danger btn-sm" onClick={() => setCloseTarget(q)}>
                          <IconLock size={14} stroke={1.75} /> 퀴즈 마감
                        </button>
                      )}
                      <button className="icon-btn danger" onClick={() => setDeleteTarget(q)}><IconTrash size={16} stroke={1.75} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!closeTarget} danger busy={busy} title="퀴즈 마감"
        message={`[퀴즈 마감] — ${(closeTarget?.quiz_submissions || []).length}명의 답안이 즉시 자동채점되고 신규 응시가 차단됩니다. 마감 후에는 재채점만 가능합니다.`}
        confirmLabel="마감하고 자동채점" onConfirm={closeAndGrade} onClose={() => setCloseTarget(null)} />
      <ConfirmDialog open={!!deleteTarget} danger title="퀴즈 삭제"
        message={`'${deleteTarget?.title}' 퀴즈와 모든 응시 데이터가 삭제됩니다. 계속하시겠습니까?`}
        confirmLabel="삭제" onConfirm={remove} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}

/* ============ 퀴즈 빌더 ============ */
function QuizBuilder({ quizId, courses, onDone }) {
  const toast = useToast()
  const [quiz, setQuiz] = useState(quizId ? null : {
    title: '', description: '', cohort_course_id: courses[0]?.id || '', reveal_answers: true,
  })
  const [questions, setQuestions] = useState(quizId ? null : [])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!quizId) return
    ;(async () => {
      const [qzQ, qQ] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', quizId).single(),
        supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('order_no'),
      ])
      setQuiz(qzQ.data)
      setQuestions((qQ.data || []).map((q) => ({
        ...q,
        answerChoice: q.type === 'choice' ? (q.answer || []) : [],
        answerShort: q.type === 'short' ? (q.answer || []).join(', ') : '',
        answerOx: q.type === 'ox' ? (q.answer || '') : '',
      })))
    })()
  }, [quizId])

  if (!quiz || !questions) return <Loading />

  function newQuestion(type = 'choice') {
    return {
      _localId: Math.random().toString(36).slice(2),
      type, text: '', points: 1, options: ['보기 1', '보기 2', '보기 3', '보기 4'],
      answerChoice: [], answerShort: '', answerOx: '',
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
  function answerMissing(q) {
    if (q.type === 'choice') return q.answerChoice.length === 0
    if (q.type === 'short') return !q.answerShort.trim()
    if (q.type === 'ox') return !q.answerOx
    return true
  }

  async function save() {
    if (!quiz.title.trim()) { toast('퀴즈 제목을 입력해 주세요.', 'error'); return }
    if (!quiz.cohort_course_id) { toast('연결 강좌를 선택해 주세요.', 'error'); return }
    setBusy(true)
    try {
      let qid = quizId
      const meta = {
        title: quiz.title.trim(), description: quiz.description,
        cohort_course_id: quiz.cohort_course_id, reveal_answers: quiz.reveal_answers,
      }
      if (qid) {
        const { error } = await supabase.from('quizzes').update(meta).eq('id', qid)
        if (error) throw error
        await supabase.from('quiz_questions').delete().eq('quiz_id', qid)
      } else {
        const { data, error } = await supabase.from('quizzes').insert({ ...meta, status: 'draft' }).select('id').single()
        if (error) throw error
        qid = data.id
      }
      if (questions.length) {
        const rows = questions.map((q, i) => ({
          quiz_id: qid, order_no: i + 1, type: q.type, text: q.text, points: Number(q.points) || 1,
          options: q.type === 'choice' ? q.options : [],
          answer: q.type === 'choice'
            ? (q.answerChoice.length ? q.answerChoice : null)
            : q.type === 'short'
              ? (q.answerShort.trim() ? q.answerShort.split(',').map((s) => s.trim()).filter(Boolean) : null)
              : (q.answerOx || null),
        }))
        const { error } = await supabase.from('quiz_questions').insert(rows)
        if (error) throw error
      }
      toast('퀴즈가 저장되었습니다.')
      onDone()
    } catch {
      toast('저장에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  const anyMissing = questions.some(answerMissing)

  return (
    <div className="stack" style={{ gap: 0, maxWidth: 860 }}>
      <div className="toolbar-sticky">
        <span className="t-caption muted">
          {quizId ? '퀴즈 편집' : '새 퀴즈'}
          {anyMissing && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>정답 누락 문항이 있습니다</span>}
        </span>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-white btn-sm" onClick={onDone}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>

      <div className="card-panel mb-16">
        <div className="field">
          <label>퀴즈 제목 <span className="req">*</span></label>
          <input className="input" value={quiz.title} onChange={(e) => setQuiz({ ...quiz, title: e.target.value })} />
        </div>
        <div className="field">
          <label>안내문</label>
          <textarea className="textarea" style={{ minHeight: 80 }} value={quiz.description}
            onChange={(e) => setQuiz({ ...quiz, description: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>연결 강좌 <span className="req">*</span></label>
            <select className="select" value={quiz.cohort_course_id || ''}
              onChange={(e) => setQuiz({ ...quiz, cohort_course_id: e.target.value })}>
              {courses.map((c) => <option key={c.id} value={c.id}>{pad2(c.course_no)}. {c.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>결과 공개 시 정답 노출</label>
            <div className="checkbox-row" style={{ height: 48 }}>
              <input id="reveal" type="checkbox" checked={quiz.reveal_answers}
                onChange={(e) => setQuiz({ ...quiz, reveal_answers: e.target.checked })} />
              <label htmlFor="reveal">채점 후 학습자에게 정답을 공개합니다 (기본)</label>
            </div>
          </div>
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id || q._localId} className={`builder-block ${answerMissing(q) ? 'missing-answer' : ''}`}>
          <div className="row mb-16" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="t-micro muted">Q{i + 1}</span>
            <select className="select-sm" style={{ height: 36 }} value={q.type} onChange={(e) => updateQ(i, { type: e.target.value })}>
              {Object.entries(Q_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="row t-label muted" style={{ gap: 6 }}>
              배점 <input className="input" type="number" min="0" step="0.5" style={{ width: 80, height: 36 }}
                value={q.points} onChange={(e) => updateQ(i, { points: e.target.value })} />
            </label>
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
              {q.options.map((opt, oi) => {
                const isAnswer = q.answerChoice.includes(oi)
                return (
                  <div key={oi} className="row" style={{
                    background: isAnswer ? 'var(--success-wash)' : 'transparent',
                    boxShadow: isAnswer ? 'inset 3px 0 0 var(--success)' : 'none',
                    borderRadius: 8, padding: '4px 8px',
                  }}>
                    <button type="button"
                      className={`btn btn-sm ${isAnswer ? 'btn-primary' : 'btn-white'}`}
                      style={isAnswer ? { background: 'var(--success)' } : {}}
                      onClick={() => updateQ(i, {
                        answerChoice: isAnswer ? q.answerChoice.filter((x) => x !== oi) : [...q.answerChoice, oi],
                      })}>
                      정답
                    </button>
                    <input className="input" style={{ height: 40 }} value={opt}
                      onChange={(e) => updateQ(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })} />
                    <button className="icon-btn danger" disabled={q.options.length <= 2}
                      onClick={() => updateQ(i, {
                        options: q.options.filter((_, x) => x !== oi),
                        answerChoice: q.answerChoice.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)),
                      })}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </div>
                )
              })}
              <div className="row">
                <button className="btn btn-text" onClick={() => updateQ(i, { options: [...q.options, `보기 ${q.options.length + 1}`] })}>+ 보기 추가</button>
                <span className="t-caption muted-soft">복수 정답 지정 시, 지정된 보기 중 하나를 고르면 정답 처리됩니다.</span>
              </div>
            </div>
          )}

          {q.type === 'short' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>정답 텍스트 (복수 인정 시 쉼표로 구분)</label>
              <input className="input" placeholder="예: RLS, Row Level Security" value={q.answerShort}
                onChange={(e) => updateQ(i, { answerShort: e.target.value })} />
              <span className="hint">채점 시 공백 제거·대소문자 무시로 비교합니다.</span>
            </div>
          )}

          {q.type === 'ox' && (
            <div className="row" style={{ gap: 8 }}>
              <span className="t-label muted">정답:</span>
              {['O', 'X'].map((v) => (
                <button key={v} type="button"
                  className={`btn btn-sm ${q.answerOx === v ? 'btn-primary' : 'btn-white'}`}
                  style={q.answerOx === v ? { background: 'var(--success)' } : {}}
                  onClick={() => updateQ(i, { answerOx: v })}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {answerMissing(q) && (
            <div className="t-caption mt-8" style={{ color: 'var(--warning)' }}>정답을 지정해야 공개할 수 있습니다.</div>
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
    </div>
  )
}

/* ============ 퀴즈 통계 ============ */
function QuizStats({ quizId, cohortId, onBack, onRegrade }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [regradeOpen, setRegradeOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [qzQ, qQ, sQ, mQ] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('order_no'),
      supabase.from('quiz_submissions').select('*, profiles(name, org), quiz_answers(question_id, value, is_correct, earned_score)').eq('quiz_id', quizId),
      supabase.from('cohort_members').select('user_id, profiles(name)').eq('cohort_id', cohortId),
    ])
    setData({ quiz: qzQ.data, questions: qQ.data || [], subs: sQ.data || [], members: mQ.data || [] })
  }
  useEffect(() => { load() }, [quizId])

  if (!data) return <Loading />
  const { quiz, questions, subs, members } = data
  const total = members.length
  const taken = subs.length
  const totalPoints = questions.reduce((s, q) => s + Number(q.points || 0), 0)
  const graded = subs.filter((s) => s.graded)
  const scores = graded.map((s) => Number(s.total_score || 0))
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const takenIds = new Set(subs.map((s) => s.user_id))
  const nonTakers = members.filter((m) => !takenIds.has(m.user_id))

  // 점수 분포 히스토그램 (10% 구간)
  const buckets = Array.from({ length: 10 }, (_, i) => ({ name: `${i * 10}~${i * 10 + 10}`, 인원: 0 }))
  for (const s of scores) {
    const pct = totalPoints ? (s / totalPoints) * 100 : 0
    buckets[Math.min(9, Math.floor(pct / 10))].인원 += 1
  }

  async function regrade() {
    setBusy(true)
    const { data: r, error } = await supabase.rpc('grade_quiz', { p_quiz_id: quizId })
    setBusy(false)
    if (error || !r?.ok) { toast('재채점 실패', 'error'); return }
    toast(`${r.graded}명 재채점 완료`)
    setRegradeOpen(false)
    load()
    onRegrade?.()
  }

  function exportCsv() {
    const header = ['성명', '소속', '점수', ...questions.map((q, i) => `Q${i + 1}`)]
    const rows = subs.map((s) => [
      s.profiles?.name, s.profiles?.org, s.total_score ?? '',
      ...questions.map((q) => {
        const a = (s.quiz_answers || []).find((x) => x.question_id === q.id)
        return a ? (a.is_correct ? 'O' : 'X') : '-'
      }),
    ])
    downloadCsv(`퀴즈성적_${quiz.title}.csv`, [header, ...rows])
  }

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 1000 }}>
      <div className="row-between">
        <h2 className="t-h2">{quiz.title} — 결과 통계</h2>
        <div className="row" style={{ gap: 8 }}>
          {quiz.status === 'closed' && (
            <button className="btn btn-white btn-sm" onClick={() => setRegradeOpen(true)}>
              <IconRefresh size={14} stroke={1.75} /> 재채점
            </button>
          )}
          <button className="btn btn-white btn-sm" onClick={exportCsv}><IconFileSpreadsheet size={14} stroke={1.75} /> CSV 내보내기</button>
          <button className="btn btn-white btn-sm" onClick={onBack}>목록으로</button>
        </div>
      </div>

      <div className="kpi-row">
        <StatCard label="응시율" value={`${total ? Math.round((taken / total) * 100) : 0}%`} caption={`전체 ${total}명 / 응시 ${taken}명`} large />
        <StatCard label="평균 점수" value={quiz.status === 'closed' ? `${avg.toFixed(1)} / ${totalPoints}` : '채점 전'} />
        <StatCard label="최고 점수" value={scores.length ? Math.max(...scores) : '-'} />
        <StatCard label="최저 점수" value={scores.length ? Math.min(...scores) : '-'} />
      </div>

      {quiz.status === 'closed' && scores.length > 0 && (
        <div className="chart-panel">
          <h3 className="t-h3 mb-16">점수 분포 <span className="t-caption muted-soft">(득점률 구간, %)</span></h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={buckets}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
              {totalPoints > 0 && (
                <ReferenceLine x={buckets[Math.min(9, Math.floor((avg / totalPoints) * 10))].name}
                  stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={2}
                  label={{ value: `평균 ${avg.toFixed(1)}점`, fontSize: 11, fill: 'var(--accent-deep)', position: 'top' }} />
              )}
              <Bar dataKey="인원" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28}
                label={{ position: 'top', fontSize: 11 }} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="chart-panel">
        <h3 className="t-h3 mb-16">문항별 정답률 <span className="t-caption muted-soft">— 40% 미만은 재교육 시그널</span></h3>
        {questions.map((q, i) => {
          const answered = subs.filter((s) => s.graded)
          const correct = answered.filter((s) => (s.quiz_answers || []).find((a) => a.question_id === q.id)?.is_correct).length
          const rate = answered.length ? Math.round((correct / answered.length) * 100) : 0
          const low = quiz.status === 'closed' && rate < 40
          return (
            <div key={q.id}>
              <div className="hbar-row">
                <div className="hbar-label" title={q.text}>Q{i + 1}. {q.text}</div>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${rate}%`, background: low ? 'var(--danger)' : 'var(--chart-1)' }} />
                </div>
                <div className="hbar-value">
                  {rate}%
                  {low && <span className="pill pill-closed" style={{ marginLeft: 6 }}>재교육 필요</span>}
                </div>
              </div>
              {quiz.status === 'closed' && (
                <QuestionBreakdown q={q} subs={graded} />
              )}
            </div>
          )
        })}
      </div>

      <div className="chart-panel">
        <h3 className="t-h3 mb-16">학생별 성적표</h3>
        <div className="table-wrap" style={{ border: 'none', maxHeight: 420 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col">성명</th><th>소속</th><th>점수</th>
                {questions.map((_, i) => <th key={i} style={{ textAlign: 'center' }}>Q{i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="sticky-col t-emph">{s.profiles?.name}</td>
                  <td className="t-muted-sm">{s.profiles?.org}</td>
                  <td className="tnum">{s.graded ? `${s.total_score} / ${totalPoints}` : '채점 대기'}</td>
                  {questions.map((q) => {
                    const a = (s.quiz_answers || []).find((x) => x.question_id === q.id)
                    return (
                      <td key={q.id} className="matrix-cell" style={{ color: a?.is_correct ? 'var(--success)' : 'var(--danger)' }}>
                        {s.graded ? (a?.is_correct ? '✓' : '✗') : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nonTakers.length > 0 && (
          <details className="mt-16">
            <summary className="btn-text btn" style={{ cursor: 'pointer' }}>미응시자 명단 ({nonTakers.length}명)</summary>
            <div className="t-muted-sm mt-8">{nonTakers.map((m) => m.profiles?.name).join(', ')}</div>
          </details>
        )}
      </div>

      <ConfirmDialog open={regradeOpen} danger busy={busy} title="전체 재채점"
        message="현재 저장된 정답 기준으로 모든 응시자의 답안을 다시 채점합니다. 계속하시겠습니까?"
        confirmLabel="재채점 실행" onConfirm={regrade} onClose={() => setRegradeOpen(false)} />
    </div>
  )
}

function QuestionBreakdown({ q, subs }) {
  const answers = subs.map((s) => (s.quiz_answers || []).find((a) => a.question_id === q.id)).filter(Boolean)
  if (q.type === 'choice') {
    return (
      <div style={{ marginLeft: 172, marginBottom: 12 }}>
        {(q.options || []).map((opt, oi) => {
          const cnt = answers.filter((a) => Array.isArray(a.value) && a.value.includes(oi)).length
          const isAnswer = (q.answer || []).includes(oi)
          return (
            <div key={oi} className="t-caption tnum" style={{ color: isAnswer ? 'var(--success)' : 'var(--muted-soft)' }}>
              {isAnswer ? '✓' : '·'} {opt} — {cnt}명
            </div>
          )
        })}
      </div>
    )
  }
  if (q.type === 'ox') {
    const o = answers.filter((a) => a.value === 'O').length
    const x = answers.filter((a) => a.value === 'X').length
    return <div className="t-caption tnum muted-soft" style={{ marginLeft: 172, marginBottom: 12 }}>O {o}명 · X {x}명 (정답 {String(q.answer)})</div>
  }
  const wrongs = answers.filter((a) => !a.is_correct && a.value).map((a) => String(a.value))
  if (!wrongs.length) return null
  return (
    <div className="t-caption muted-soft" style={{ marginLeft: 172, marginBottom: 12 }}>
      오답 응답: {[...new Set(wrongs)].slice(0, 10).join(', ')}
    </div>
  )
}
