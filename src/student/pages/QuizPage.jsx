import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconCheck, IconX, IconClock } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, useToast } from '../../shared/ui'

export default function QuizPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [mySub, setMySub] = useState(undefined)
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  async function load() {
    const [qzQ, qQ, subQ] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', id).single(),
      // 정답이 차단된 학생용 뷰 (마감+공개 시에만 answer 포함)
      supabase.from('quiz_questions_student').select('*').eq('quiz_id', id).order('order_no'),
      supabase.from('quiz_submissions').select('*, quiz_answers(question_id, value, is_correct, earned_score)')
        .eq('quiz_id', id).eq('user_id', profile.id).maybeSingle(),
    ])
    if (!qzQ.data) { setQuiz(false); return }
    setQuiz(qzQ.data)
    setQuestions(qQ.data || [])
    setMySub(subQ.data || null)
  }

  useEffect(() => { load() }, [id, profile.id])

  if (quiz === null || mySub === undefined) return <Loading />
  if (quiz === false) return <EmptyState title="퀴즈를 찾을 수 없습니다" />

  const back = (
    <button className="btn btn-text mb-16" onClick={() => {
      if (!dirty.current || confirm('작성 중인 답안이 사라집니다. 나가시겠습니까?')) nav(-1)
    }}>
      <IconArrowLeft size={14} stroke={1.75} /> 돌아가기
    </button>
  )

  /* ---------- 결과 화면 ---------- */
  if (quiz.status === 'closed' && mySub?.graded) {
    const totalPoints = questions.reduce((s, q) => s + Number(q.points || 0), 0)
    const score = Number(mySub.total_score || 0)
    const pctVal = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0
    const ansMap = {}
    for (const a of mySub.quiz_answers || []) ansMap[a.question_id] = a
    const correctCount = (mySub.quiz_answers || []).filter((a) => a.is_correct).length

    return (
      <div>
        {back}
        <div className="score-hero mb-24">
          <div>
            <div className="t-caption" style={{ opacity: 0.8 }}>{quiz.title} — 내 점수</div>
            <div className="t-stat-lg tnum">
              {score} / {totalPoints} <span style={{ color: 'var(--accent)' }}>{pctVal}%</span>
            </div>
          </div>
          <div className="t-body" style={{ color: 'var(--success-wash)' }}>
            정답 {correctCount}문항 · <span style={{ color: 'var(--danger-wash)' }}>오답 {questions.length - correctCount}문항</span>
          </div>
        </div>
        {questions.map((q, i) => {
          const mine = ansMap[q.id]
          const correct = mine?.is_correct
          return (
            <div key={q.id} className="question-card">
              <div className="row-between mb-8">
                <span className="t-micro muted">Q{i + 1} · 배점 {q.points}점</span>
                <span className={`pill ${correct ? 'pill-done' : 'pill-closed'}`}>
                  <span className="dot" />{correct ? '정답' : '오답'}
                </span>
              </div>
              <div className="t-h3 mb-16">{q.text}</div>
              <div className={`answer-mark ${correct ? 'correct' : 'wrong'}`}>
                {correct ? <IconCheck size={16} stroke={1.75} /> : <IconX size={16} stroke={1.75} />}
                내 답변: {renderValue(q, mine?.value)}
              </div>
              {!correct && q.answer != null && (
                <div className="t-body mt-8" style={{ color: 'var(--success)' }}>
                  정답: {renderAnswer(q)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /* ---------- 채점 대기 ---------- */
  if (mySub) {
    return (
      <div>
        {back}
        <EmptyState icon={IconClock} title="채점 대기 중입니다"
          description="관리자가 마감·채점을 실행하면 결과가 공개됩니다." />
      </div>
    )
  }

  /* ---------- 마감 후 미응시 ---------- */
  if (quiz.status !== 'open') {
    return (
      <div>
        {back}
        <EmptyState title="응시 기간이 종료되었습니다" />
      </div>
    )
  }

  /* ---------- 응시 화면 ---------- */
  function setAnswer(qid, v) {
    dirty.current = true
    setAnswers((a) => ({ ...a, [qid]: v }))
  }

  async function submit() {
    const unanswered = questions.filter((q) => answers[q.id] == null || (Array.isArray(answers[q.id]) && !answers[q.id].length) || answers[q.id] === '')
    if (unanswered.length && !confirm(`응답하지 않은 문항이 ${unanswered.length}개 있습니다. 그대로 제출하시겠습니까?`)) return
    if (!confirm('제출 후에는 수정할 수 없습니다. 제출하시겠습니까?')) return
    setBusy(true)
    try {
      const { data: sub, error } = await supabase.from('quiz_submissions')
        .insert({ quiz_id: id, user_id: profile.id }).select('id').single()
      if (error) throw error
      const rows = questions
        .filter((q) => answers[q.id] != null && answers[q.id] !== '')
        .map((q) => ({ submission_id: sub.id, question_id: q.id, value: answers[q.id] }))
      if (rows.length) {
        const { error: e2 } = await supabase.from('quiz_answers').insert(rows)
        if (e2) throw e2
      }
      dirty.current = false
      toast('답안이 제출되었습니다.')
      await load()
    } catch {
      toast('제출에 실패했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {back}
      <div className="card-panel mb-16" style={{ borderTop: '4px solid var(--primary)' }}>
        <h1 className="t-h1 mb-8">{quiz.title}</h1>
        {quiz.description && <p className="t-muted-sm" style={{ whiteSpace: 'pre-wrap' }}>{quiz.description}</p>}
        <p className="t-caption muted-soft mt-8">1인 1회 응시 · 제출 후 수정 불가</p>
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="question-card">
          <div className="t-micro muted mb-8">Q{i + 1} · 배점 {q.points}점</div>
          <div className="t-h3 mb-16">{q.text}</div>
          {q.type === 'choice' && (
            <div className="stack" style={{ gap: 8 }}>
              {(q.options || []).map((opt, oi) => {
                const checked = (answers[q.id] || []).includes(oi)
                return (
                  <label key={oi} className={`choice-row ${checked ? 'selected' : ''}`}>
                    <input type="radio" name={q.id} checked={checked} onChange={() => setAnswer(q.id, [oi])} />
                    {opt}
                  </label>
                )
              })}
            </div>
          )}
          {q.type === 'short' && (
            <input className="input" value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)} placeholder="답안을 입력하세요" />
          )}
          {q.type === 'ox' && (
            <div className="ox-grid">
              {['O', 'X'].map((v) => (
                <button key={v} type="button" className={`ox-btn ${answers[q.id] === v ? 'selected' : ''}`} onClick={() => setAnswer(q.id, v)}>
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button className="btn btn-primary sheen btn-block mt-24" onClick={submit} disabled={busy}>
        {busy ? '제출 중…' : '답안 제출'}
      </button>
    </div>
  )
}

function renderValue(q, value) {
  if (value == null) return <span className="muted-soft">무응답</span>
  if (q.type === 'choice') {
    const arr = Array.isArray(value) ? value : []
    return arr.map((i) => q.options?.[i] ?? `${i + 1}번`).join(', ') || '무응답'
  }
  if (q.type === 'ox') return String(value)
  return String(value)
}

function renderAnswer(q) {
  if (q.answer == null) return ''
  if (q.type === 'choice') {
    const arr = Array.isArray(q.answer) ? q.answer : []
    return arr.map((i) => `${Number(i) + 1}번 — ${q.options?.[Number(i)] ?? ''}`).join(' / ')
  }
  if (q.type === 'short') return (Array.isArray(q.answer) ? q.answer : [q.answer]).join(' / ')
  return String(q.answer)
}
