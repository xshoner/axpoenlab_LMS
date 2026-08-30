import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IconUpload, IconLink, IconFile } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill, useToast } from '../../shared/ui'
import { pad2, fmtBytes, fmtDate, extOf, getSettings, uploadFile, storageSafeName } from '../../lib/helpers'
import { useDraft, DraftBadge } from '../../shared/draft'
import { UrlHealthBadge } from '../../shared/urlcheck'

export default function Assignments() {
  const { profile } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const [courses, setCourses] = useState(null)
  const [selected, setSelected] = useState(params.get('course') || '')
  const [mode, setMode] = useState('url')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragover, setDragover] = useState(false)
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState({ allowedExtensions: [], maxFileSizeMb: 5 })
  const fileInput = useRef(null)
  const draft = useDraft(`assignment:${profile.id}`, { selected, url, mode },
    (d) => { if (d.selected && !params.get('course')) setSelected(d.selected); setUrl(d.url || ''); if (d.mode) setMode(d.mode) },
    (d) => !d.url)

  async function load() {
    const [cQ, sQ, settingsData] = await Promise.all([
      supabase.from('cohort_courses').select('id, course_no, title, assignment_enabled, assignment_text, assignment_due')
        .eq('assignment_enabled', true).order('course_no'),
      supabase.from('submissions').select('*, cohort_courses(course_no, title)').eq('user_id', profile.id).order('submitted_at', { ascending: false }),
      getSettings(),
    ])
    setCourses(cQ.data || [])
    setHistory(sQ.data || [])
    setSettings(settingsData)
  }

  useEffect(() => { load() }, [profile.id])

  if (!courses) return <Loading />

  const course = courses.find((c) => c.id === selected)
  const existing = history.find((h) => h.cohort_course_id === selected)
  const submittedSet = new Set(history.map((h) => h.cohort_course_id))

  function validateFile(f) {
    const maxBytes = settings.maxFileSizeMb * 1024 * 1024
    if (f.size > maxBytes) {
      setFileError(`${settings.maxFileSizeMb}MB를 초과했습니다 (선택한 파일 ${fmtBytes(f.size)})`)
      return false
    }
    if (!settings.allowedExtensions.includes(extOf(f.name))) {
      setFileError(`허용되지 않는 확장자입니다. (${settings.allowedExtensions.join(', ')})`)
      return false
    }
    setFileError('')
    return true
  }

  function pickFile(f) {
    if (!f) return
    if (validateFile(f)) setFile(f)
    else setFile(null)
  }

  async function submit() {
    if (!course) return
    setBusy(true)
    try {
      let payload
      if (mode === 'file') {
        if (!file) { toast('파일을 선택해 주세요.', 'error'); setBusy(false); return }
        if (!validateFile(file)) { setBusy(false); return }
        const path = `${profile.id}/${course.id}/${storageSafeName(file.name)}`
        await uploadFile('submissions', path, file)
        payload = { type: 'file', file_path: path, original_filename: file.name, file_size: file.size, url: null }
      } else {
        const u = url.trim()
        if (!/^https?:\/\/.+/.test(u)) { toast('올바른 URL을 입력해 주세요.', 'error'); setBusy(false); return }
        payload = { type: 'url', url: u, file_path: null, original_filename: null, file_size: null }
      }
      const { error } = await supabase.from('submissions').upsert(
        { user_id: profile.id, cohort_course_id: course.id, submitted_at: new Date().toISOString(), ...payload },
        { onConflict: 'user_id,cohort_course_id' },
      )
      if (error) throw error
      toast(existing ? '과제가 다시 제출되었습니다.' : '과제가 제출되었습니다.')
      draft.clear()
      setFile(null)
      setUrl('')
      await load()
    } catch (e) {
      toast('제출에 실패했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="card-panel">
        <h2 className="t-h2 mb-16">과제 제출</h2>
        <div className="field">
          <label>강좌 선택</label>
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— 과제가 있는 강좌를 선택하세요 —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{pad2(c.course_no)}. {c.title}</option>
            ))}
          </select>
        </div>

        {course && (
          <>
            <div style={{ background: 'var(--primary-tint)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div className="t-h3 mb-8">과제 안내</div>
              <div className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{course.assignment_text || '안내문이 없습니다.'}</div>
              {course.assignment_due && (
                <div className="t-muted-sm mt-8 tnum">
                  마감일 {fmtDate(course.assignment_due, true)}
                  {new Date(course.assignment_due) < new Date() && <span className="muted"> · 마감일 경과</span>}
                </div>
              )}
            </div>

            {existing && (
              <div className="auth-banner ok mb-16">
                {fmtDate(existing.submitted_at, true)}에 제출 완료 — 다시 제출하면 기존 제출물이 교체됩니다.
              </div>
            )}

            <div className="row mb-16" style={{ gap: 8 }}>
              <button className={`btn btn-sm ${mode === 'url' ? 'btn-primary' : 'btn-white'}`} onClick={() => setMode('url')}>
                <IconLink size={14} stroke={1.75} /> URL 제출
              </button>
              <button className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-white'}`} onClick={() => setMode('file')}>
                <IconUpload size={14} stroke={1.75} /> 파일 첨부
              </button>
            </div>

            {mode === 'file' ? (
              <>
                <div
                  className={`dropzone ${dragover ? 'dragover' : ''} ${fileError ? 'error' : ''}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={(e) => { e.preventDefault(); setDragover(false); pickFile(e.dataTransfer.files?.[0]) }}
                >
                  <IconUpload size={24} stroke={1.75} />
                  {file ? (
                    <div className="row" style={{ gap: 8 }}>
                      <IconFile size={16} stroke={1.75} />
                      <span className="t-emph" style={{ color: 'var(--foreground)' }}>{file.name}</span>
                      <span className="t-caption muted-soft">{fmtBytes(file.size)}</span>
                    </div>
                  ) : (
                    <span className="t-muted-sm">파일을 끌어다 놓거나 클릭하여 선택</span>
                  )}
                  <span className="t-caption muted-soft">
                    최대 {settings.maxFileSizeMb}MB · {settings.allowedExtensions.join(', ')}
                  </span>
                  {fileError && <span className="t-caption" style={{ color: 'var(--danger)' }}>{fileError}</span>}
                  <input ref={fileInput} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                </div>
              </>
            ) : (
              <div className="field">
                <label className="row" style={{ gap: 10 }}>제출 URL <DraftBadge savedAt={draft.savedAt} restored={draft.restored} /></label>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" placeholder="https://..." value={url} style={{ flex: 1 }} onChange={(e) => setUrl(e.target.value)} />
                  <UrlHealthBadge url={url} />
                </div>
                <span className="hint">배포된 웹앱·문서 주소를 입력하면 연결 상태를 자동으로 확인합니다 (정상/이상).</span>
              </div>
            )}

            <button className="btn btn-primary sheen btn-block mt-16" onClick={submit} disabled={busy}>
              {busy ? '제출 중…' : existing ? '다시 제출하기' : '제출하기'}
            </button>
          </>
        )}
      </section>

      <section className="card-panel">
        <div className="row-between mb-16">
          <h2 className="t-h2">내 제출 이력</h2>
          <span className="t-label tnum">
            {courses.filter((c) => submittedSet.has(c.id)).length} / {courses.length} 과제 제출
          </span>
        </div>
        {courses.length === 0 ? (
          <EmptyState title="과제가 있는 강좌가 없습니다" />
        ) : (
          <>
            <div className="heatmap-grid mb-16">
              {courses.map((c) => {
                const done = submittedSet.has(c.id)
                return (
                  <button
                    key={c.id}
                    className={`heatmap-cell ${done ? 'viewed' : ''}`}
                    aria-label={`${pad2(c.course_no)}강 ${c.title} ${done ? '제출 완료' : '미제출'}`}
                    title={`${pad2(c.course_no)}. ${c.title} — ${done ? '제출 완료' : '미제출'}`}
                    onClick={() => { setSelected(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  >
                    {pad2(c.course_no)}
                  </button>
                )
              })}
            </div>
            <p className="t-caption muted-soft mb-16">색이 칠해진 칸은 제출 완료, 빈 칸은 미제출입니다. 칸을 클릭하면 해당 과제 화면으로 이동합니다.</p>
            {history.length > 0 && (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>강좌</th><th>유형</th><th>제출 일시</th><th>상태</th></tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{h.cohort_courses ? `${pad2(h.cohort_courses.course_no)}. ${h.cohort_courses.title}` : '-'}</td>
                        <td>{h.type === 'file' ? h.original_filename : h.url}</td>
                        <td className="tnum">{fmtDate(h.submitted_at, true)}</td>
                        <td><StatusPill kind="done">제출됨</StatusPill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
