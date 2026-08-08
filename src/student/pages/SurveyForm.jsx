import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, useToast } from '../../shared/ui'

export default function SurveyForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const [survey, setSurvey] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingResponse, setExistingResponse] = useState(null)
  const dirty = useRef(false)

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty.current && !submitted) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [submitted])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [sQ, qQ, rQ] = await Promise.all([
        supabase.from('surveys').select('*').eq('id', id).single(),
        supabase.from('survey_questions').select('*').eq('survey_id', id).order('order_no'),
        supabase.from('survey_responses').select('id, survey_answers(question_id, value)').eq('survey_id', id).eq('user_id', profile.id).maybeSingle(),
      ])
      if (!alive) return
      if (!sQ.data) { setSurvey(false); return }
      setSurvey(sQ.data)
      setQuestions(qQ.data || [])
      if (rQ.data) {
        setExistingResponse(rQ.data)
        const a = {}
        for (const ans of rQ.data.survey_answers || []) a[ans.question_id] = ans.value
        setAnswers(a)
      }
    })()
    return () => { alive = false }
  }, [id, profile.id])

  if (survey === null) return <Loading />
  if (survey === false) return <EmptyState title="설문을 찾을 수 없습니다" />
  if (survey.status !== 'open') return <EmptyState title="응답 기간이 아닙니다" description="이 설문은 현재 응답을 받지 않습니다." />
  if (existingResponse && !survey.allow_edit) {
    return (
      <div className="stack">
        <EmptyState title="이미 응답을 제출했습니다" description="이 설문은 1인 1회만 응답할 수 있습니다."
          action={<button className="btn btn-white btn-sm" onClick={() => nav(-1)}>돌아가기</button>} />
      </div>
    )
  }

  function setAnswer(qid, value) {
    dirty.current = true
    setAnswers((a) => ({ ...a, [qid]: value }))
    setErrors((e) => e.filter((x) => x !== qid))
  }

  function isEmpty(q, v) {
    if (v == null) return true
    if (q.type === 'choice') return !(v.sel?.length > 0)
    if (q.type === 'short' || q.type === 'long') return !String(v).trim()
    if (q.type === 'grid') return Object.keys(v).length < (q.grid_rows || []).length
    return true
  }

  async function submit() {
    const missing = questions.filter((q) => q.required && isEmpty(q, answers[q.id])).map((q) => q.id)
    if (missing.length) {
      setErrors(missing)
      document.getElementById(`q-${missing[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      let responseId = existingResponse?.id
      if (responseId) {
        await supabase.from('survey_answers').delete().eq('response_id', responseId)
        await supabase.from('survey_responses').update({ submitted_at: new Date().toISOString() }).eq('id', responseId)
      } else {
        const { data, error } = await supabase.from('survey_responses')
          .insert({ survey_id: id, user_id: profile.id }).select('id').single()
        if (error) throw error
        responseId = data.id
      }
      const rows = questions
        .filter((q) => !isEmpty(q, answers[q.id]))
        .map((q) => ({ response_id: responseId, question_id: q.id, value: answers[q.id] }))
      if (rows.length) {
        const { error } = await supabase.from('survey_answers').insert(rows)
        if (error) throw error
      }
      dirty.current = false
      setSubmitted(true)
    } catch {
      toast('제출에 실패했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <EmptyState title="응답이 제출되었습니다" description="참여해 주셔서 감사합니다."
        action={<button className="btn btn-primary btn-sm" onClick={() => nav(-1)}>강좌로 돌아가기</button>} />
    )
  }

  return (
    <div>
      <button className="btn btn-text mb-16" onClick={() => {
        if (!dirty.current || confirm('작성 중인 응답이 사라집니다. 나가시겠습니까?')) nav(-1)
      }}>
        <IconArrowLeft size={14} stroke={1.75} /> 돌아가기
      </button>
      <div className="card-panel mb-16" style={{ borderTop: '4px solid var(--primary)' }}>
        <h1 className="t-h1 mb-8">{survey.title}</h1>
        {survey.description && <p className="t-muted-sm" style={{ whiteSpace: 'pre-wrap' }}>{survey.description}</p>}
      </div>
      {questions.map((q, i) => (
        <SurveyQuestion
          key={q.id} q={q} index={i} value={answers[q.id]}
          error={errors.includes(q.id)}
          onChange={(v) => setAnswer(q.id, v)}
        />
      ))}
      <button className="btn btn-primary sheen btn-block mt-24" onClick={submit} disabled={busy}>
        {busy ? '제출 중…' : existingResponse ? '응답 수정 제출' : '응답 제출'}
      </button>
    </div>
  )
}

function SurveyQuestion({ q, index, value, error, onChange }) {
  const options = q.options || []
  const rows = q.grid_rows || []
  const cols = q.grid_cols || []

  return (
    <div id={`q-${q.id}`} className={`question-card ${error ? 'req-error' : ''}`}>
      <div className="t-micro muted mb-8">
        Q{index + 1} {q.required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </div>
      <div className="t-h3 mb-16">{q.text}</div>

      {q.type === 'choice' && (
        <div className="stack" style={{ gap: 8 }}>
          {options.map((opt, oi) => {
            const sel = value?.sel || []
            const checked = sel.includes(oi)
            return (
              <label key={oi} className={`choice-row ${checked ? 'selected' : ''}`}>
                <input
                  type={q.multiple ? 'checkbox' : 'radio'}
                  name={q.id}
                  checked={checked}
                  onChange={() => {
                    const next = q.multiple
                      ? (checked ? sel.filter((x) => x !== oi) : [...sel, oi])
                      : [oi]
                    onChange({ ...value, sel: next })
                  }}
                />
                {opt}
              </label>
            )
          })}
          {q.has_other && (
            <label className={`choice-row ${(value?.sel || []).includes(-1) ? 'selected' : ''}`}>
              <input
                type={q.multiple ? 'checkbox' : 'radio'}
                name={q.id}
                checked={(value?.sel || []).includes(-1)}
                onChange={() => {
                  const sel = value?.sel || []
                  const checked = sel.includes(-1)
                  const next = q.multiple ? (checked ? sel.filter((x) => x !== -1) : [...sel, -1]) : [-1]
                  onChange({ ...value, sel: next })
                }}
              />
              기타:
              <input
                className="input" style={{ height: 36, flex: 1 }}
                value={value?.other || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const sel = value?.sel || []
                  onChange({ sel: sel.includes(-1) ? sel : (q.multiple ? [...sel, -1] : [-1]), other: e.target.value })
                }}
              />
            </label>
          )}
        </div>
      )}

      {q.type === 'short' && (
        <input
          className="input" maxLength={q.max_length || undefined}
          value={value || ''} onChange={(e) => onChange(e.target.value)}
        />
      )}

      {q.type === 'long' && (
        <div>
          <textarea
            className="textarea" maxLength={q.max_length || undefined}
            value={value || ''} onChange={(e) => onChange(e.target.value)}
          />
          {q.max_length && (
            <div className="t-caption tnum" style={{ textAlign: 'right', color: (value?.length || 0) > q.max_length * 0.9 ? 'var(--warning)' : 'var(--muted-soft)' }}>
              {value?.length || 0} / {q.max_length}
            </div>
          )}
        </div>
      )}

      {q.type === 'grid' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0 }}></th>
                {cols.map((c, ci) => <th key={ci} style={{ textAlign: 'center' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="t-label" style={{ position: 'sticky', left: 0, background: 'var(--background)' }}>{r}</td>
                  {cols.map((c, ci) => (
                    <td key={ci} style={{ textAlign: 'center' }}>
                      <input
                        type="radio" name={`${q.id}-${ri}`}
                        style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                        checked={value?.[ri] === ci}
                        onChange={() => onChange({ ...(value || {}), [ri]: ci })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="t-caption mt-8" style={{ color: 'var(--danger)' }}>필수 문항입니다. 응답해 주세요.</div>}
    </div>
  )
}
