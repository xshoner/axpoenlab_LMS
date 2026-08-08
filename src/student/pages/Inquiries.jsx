import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconDownload, IconPlus } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, StatusPill, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, extOf, getSettings, uploadFile, downloadFile, pad2 } from '../../lib/helpers'

export default function Inquiries() {
  return (
    <Routes>
      <Route index element={<InquiryList />} />
      <Route path="new" element={<InquiryNew />} />
      <Route path=":id" element={<InquiryDetail />} />
    </Routes>
  )
}

function InquiryList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('inquiries').select('id, title, status, created_at')
      .eq('user_id', profile.id).order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [profile.id])

  if (!rows) return <Loading />

  return (
    <div className="stack">
      <div className="row-between">
        <h2 className="t-h2">내 문의 내역</h2>
        <Link to="new" className="btn btn-primary btn-sm"><IconPlus size={14} stroke={1.75} /> 문의 작성</Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="문의 내역이 없습니다" description="궁금한 점을 운영진에게 남겨 보세요."
          action={<Link to="new" className="btn btn-primary btn-sm">문의 작성</Link>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>제목</th><th style={{ width: 120 }}>상태</th><th style={{ width: 130 }}>작성일</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link to={r.id} style={{ textDecoration: 'none', color: 'var(--foreground)' }}>{r.title}</Link></td>
                  <td>{r.status === 'answered' ? <StatusPill kind="done">답변 완료</StatusPill> : <StatusPill kind="open">답변 대기</StatusPill>}</td>
                  <td className="tnum">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InquiryNew() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [courseId, setCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState({ allowedExtensions: [], maxFileSizeMb: 5 })
  const fileInput = useRef(null)

  useEffect(() => {
    supabase.from('cohort_courses').select('id, course_no, title').order('course_no')
      .then(({ data }) => setCourses(data || []))
    getSettings().then(setSettings)
  }, [])

  function pickFile(f) {
    if (!f) return
    if (f.size > settings.maxFileSizeMb * 1024 * 1024) {
      setFileError(`${settings.maxFileSizeMb}MB를 초과했습니다 (선택한 파일 ${fmtBytes(f.size)})`)
      setFile(null)
      return
    }
    setFileError('')
    setFile(f)
  }

  async function submit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { toast('제목과 내용을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      let filePath = null
      if (file) {
        filePath = `${profile.id}/${Date.now()}_${file.name}`
        await uploadFile('inquiry-files', filePath, file)
      }
      const { error } = await supabase.from('inquiries').insert({
        user_id: profile.id, title: title.trim(), body: body.trim(),
        file_path: filePath, filename: file?.name || null,
        cohort_course_id: courseId || null,
      })
      if (error) throw error
      toast('문의가 등록되었습니다.')
      nav('/inquiries')
    } catch {
      toast('등록에 실패했습니다.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-panel" style={{ maxWidth: 720 }}>
      <h2 className="t-h2 mb-16">문의 작성</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label>제목 <span className="req">*</span></label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>내용 <span className="req">*</span></label>
          <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="field">
          <label>관련 강좌 (선택)</label>
          <select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">선택 안 함</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{pad2(c.course_no)}. {c.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label>첨부파일 (선택, {settings.maxFileSizeMb}MB 이내 1개)</label>
          <button type="button" className="btn btn-white btn-sm" onClick={() => fileInput.current?.click()}>
            {file ? `${file.name} (${fmtBytes(file.size)})` : '파일 선택'}
          </button>
          {fileError && <span className="err-msg">{fileError}</span>}
          <input ref={fileInput} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-white" onClick={() => nav('/inquiries')}>취소</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? '등록 중…' : '문의 등록'}</button>
        </div>
      </form>
    </div>
  )
}

function InquiryDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [inquiry, setInquiry] = useState(null)

  useEffect(() => {
    supabase.from('inquiries')
      .select('*, inquiry_replies(*, profiles(name, role)), cohort_courses(course_no, title)')
      .eq('id', id).single()
      .then(({ data }) => setInquiry(data || false))
  }, [id])

  if (inquiry === null) return <Loading />
  if (inquiry === false) return <EmptyState title="문의를 찾을 수 없습니다" />

  const replies = (inquiry.inquiry_replies || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/inquiries')}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>
      <div className="card-panel">
        <div className="row-between mb-8">
          <h2 className="t-h2">{inquiry.title}</h2>
          {inquiry.status === 'answered' ? <StatusPill kind="done">답변 완료</StatusPill> : <StatusPill kind="open">답변 대기</StatusPill>}
        </div>
        <div className="t-caption muted-soft tnum mb-16">
          {fmtDate(inquiry.created_at, true)}
          {inquiry.cohort_courses && ` · 관련 강좌: ${pad2(inquiry.cohort_courses.course_no)}. ${inquiry.cohort_courses.title}`}
        </div>
        <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{inquiry.body}</p>
        {inquiry.file_path && (
          <div className="attachment-row mt-16" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
            <span>{inquiry.filename}</span>
            <button className="icon-btn" style={{ marginLeft: 'auto' }}
              onClick={() => downloadFile('inquiry-files', inquiry.file_path, inquiry.filename).catch(() => toast('다운로드 실패', 'error'))}>
              <IconDownload size={18} stroke={1.75} />
            </button>
          </div>
        )}
      </div>
      {replies.map((r) => (
        <div key={r.id} className="card-panel" style={{ background: r.profiles?.role !== 'student' ? 'var(--primary-tint)' : 'var(--background)' }}>
          <div className="row mb-8" style={{ gap: 8 }}>
            <span className="avatar">{(r.profiles?.name || '?').slice(0, 1)}</span>
            <span className="t-label">{r.profiles?.name}</span>
            {r.profiles?.role !== 'student' && <span className="badge-role-soft">운영진</span>}
            <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(r.created_at, true)}</span>
          </div>
          <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
        </div>
      ))}
    </div>
  )
}
