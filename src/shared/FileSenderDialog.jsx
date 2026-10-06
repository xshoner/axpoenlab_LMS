import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { readAll } from '../lib/queries'
import { getSettings, extOf, fmtBytes, fmtDate, storageSafeName } from '../lib/helpers'
import { useAuth } from './auth'
import { Dialog, ConfirmDialog, useToast } from './ui'
import { retryDeliveryRequest } from '../lib/deliveryRequests'
import { checked } from './fileTransfers'
import { AdminPushComposer, isBlankHtml } from './push'
import { IconChevronDown, IconFile, IconHistory, IconMail, IconPaperclip, IconSend, IconUpload, IconX } from '@tabler/icons-react'
import './fileSender.css'
const RichEditor = lazy(() => import('./RichEditor'))

export default function FileSenderDialog({ cohortId, cohorts, onClose }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [target, setTarget] = useState(cohortId || '')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [files, setFiles] = useState([])
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [all, setAll] = useState(true)
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [search, setSearch] = useState('')
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [error, setError] = useState('')
  const [deleteFile, setDeleteFile] = useState(null)
  const [dragover, setDragover] = useState(false)
  const fileInput = useRef(null)
  const retry = useRef(null)
  const historyRequest = useRef(0)

  async function loadHistory() {
    if (!historyOpen) return
    const request = ++historyRequest.current
    setHistoryLoading(true)
    let q = supabase.from('file_batches').select('id,title,status,sender_id,created_at,sent_at,cohort_id,file_batch_files(id,filename,size_bytes,deleted_at)')
      .order('created_at', { ascending: false }).range(historyPage * 20, historyPage * 20 + 19)
    if (target) q = q.eq('cohort_id', target)
    try {
      const rows = checked(await q.abortSignal(AbortSignal.timeout(10000))) || []
      if (request === historyRequest.current) setHistory(rows)
    } finally { if (request === historyRequest.current) setHistoryLoading(false) }
  }
  useEffect(() => {
    let alive = true
    setMembers([]); setSelected(new Set()); setAll(true); setError(''); setStatus(null)
    if (target) readAll(() => supabase.from('cohort_members').select('user_id,profiles!inner(id,name,status,role)')
      .eq('cohort_id', target).eq('profiles.status', 'active').eq('profiles.role', 'student').order('user_id'))
      .then(rows => { if (alive) setMembers(rows.map(x => x.profiles)) })
      .catch(() => { if (alive) setError('학생 목록을 불러오지 못했습니다. 창을 다시 열어 주세요.') })
    return () => { alive = false }
  }, [target])
  useEffect(() => { loadHistory().catch(() => setError('전송 이력을 불러오지 못했습니다.')) }, [target, historyPage, historyOpen])
  useEffect(() => {
    if (!status || status.batch.status === 'draft') return
    let alive = true, running = false
    async function refresh() {
      if (running) return
      running = true
      try {
        const rows = await readAll(() => supabase.from('file_recipients').select('*').eq('batch_id', status.batch.id).order('user_id'))
        const fileIds = status.batch.file_batch_files.map(f => f.id)
        const requests = fileIds.length ? await readAll(() => supabase.from('file_download_requests').select('file_id,user_id,requested_at')
          .in('file_id', fileIds).order('file_id').order('user_id')) : []
        if (alive) setStatus(prev => prev?.batch.id === status.batch.id ? { ...prev, rows, requests, loading: false, error: false } : prev)
      } catch { if (alive) setStatus(prev => prev?.batch.id === status.batch.id ? { ...prev, loading: false, error: true } : prev) }
      finally { running = false }
    }
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [status?.batch.id])

  async function send() {
    setBusy(true); setError('')
    let phase = '전송 설정 확인 중…'
    try {
      setProgress(phase)
      const settings = await retryDeliveryRequest(() => getSettings(true))
      const max = Math.min(50, settings.maxFileSizeMb) * 1048576
      if (!target || !title.trim() || (!files.length && isBlankHtml(memo)) || files.length > 10 || (!all && !selected.size)) throw new Error('기수, 제목, 수신 학생과 쪽지 내용 또는 파일을 입력해 주세요.')
      for (const file of files) {
        if (!file.size || file.size > max || !settings.allowedExtensions.includes(extOf(file.name)))
          throw new Error(`${file.name}: 허용 확장자(${settings.allowedExtensions.join(', ')}) 또는 용량(${fmtBytes(max)})을 확인해 주세요.`)
      }
      // Retain the same draft and paths on failure, making a lost response safe to retry.
      if (!retry.current) {
        const id = crypto.randomUUID()
        retry.current = { id, entries: files.map(f => ({ filename: f.name, size_bytes: f.size, file_path: `${profile.id}/${id}/${storageSafeName(f.name)}` })), uploaded: new Set() }
        setHasDraft(true)
      }
      const draft = retry.current
      setProgress(phase = '전송 초안 준비 중…')
      checked(await retryDeliveryRequest(() => supabase.rpc('create_distribution', {
        p_cohort: target, p_title: title.trim(), p_memo: '', p_html: memo, p_id: draft.id,
      }).abortSignal(AbortSignal.timeout(15000))))
      for (let i = 0; i < files.length; i++) {
        if (draft.uploaded.has(i)) continue
        setProgress(phase = `파일 업로드 ${i + 1}/${files.length}`)
        await retryDeliveryRequest(async () => {
          const bucket = supabase.storage.from('student-deliveries')
          const result = await bucket.upload(draft.entries[i].file_path, files[i], { upsert: false })
          if (result.error && ['409', 'Duplicate'].includes(String(result.error.statusCode || result.error.error))) {
            const info = checked(await bucket.info(draft.entries[i].file_path))
            if (Number(info.size) !== files[i].size) throw new Error('이미 업로드된 파일의 용량이 다릅니다. 임시 파일을 정리한 뒤 다시 보내 주세요.')
            return { data: info }
          }
          return result
        })
        draft.uploaded.add(i)
      }
      setProgress(phase = '학생에게 전송 중…')
      const count = checked(await retryDeliveryRequest(() => supabase.rpc('send_distribution', {
        p_batch: draft.id, p_files: draft.entries, p_students: all ? null : [...selected],
      }).abortSignal(AbortSignal.timeout(15000))))
      retry.current = null
      setHasDraft(false)
      setFiles([]); setTitle(''); setMemo(''); setEditorKey(k => k + 1); if (fileInput.current) fileInput.current.value = ''
      toast(`${count}명에게 쪽지/파일을 보냈습니다.`)
      await loadHistory().catch(() => setError('전송은 완료됐지만 이력을 불러오지 못했습니다. 창을 다시 열어 확인해 주세요.'))
    } catch (e) { setError(`${phase.replace(/ 중…$/, '')}에 실패했습니다. ${e?.message || ''} 다시 누르면 같은 전송을 이어서 시도합니다.`) }
    finally { setBusy(false); setProgress('') }
  }
  const locked = busy || hasDraft
  function addFiles(incoming) {
    if (locked) return
    const next = [...files]
    for (const file of incoming) {
      if (!next.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) next.push(file)
    }
    if (next.length > 10) { setError('첨부파일은 최대 10개까지 추가할 수 있습니다. 기존 파일을 제거한 뒤 다시 추가해 주세요.'); return }
    setFiles(next); setError('')
  }
  async function discard(batch) {
    setBusy(true)
    try {
      const prefix = `${profile.id}/${batch.id}`
      const objects = checked(await supabase.storage.from('student-deliveries').list(prefix, { limit: 100 })) || []
      if (objects.length) checked(await supabase.storage.from('student-deliveries').remove(objects.map(o => `${prefix}/${o.name}`)))
      checked(await supabase.rpc('discard_file_batch', { p_batch: batch.id }))
      if (retry.current?.id === batch.id) { retry.current = null; setHasDraft(false) }
      await loadHistory()
      toast('미전송 임시 파일을 정리했습니다.')
    } catch { setError('임시 파일을 정리하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  async function close() {
    if (busy) return
    if (retry.current) {
      setBusy(true)
      try {
        const draft = retry.current
        const batch = checked(await supabase.from('file_batches').select('status').eq('id', draft.id).maybeSingle())
        if (batch?.status === 'draft') {
          if (draft.entries.length) checked(await supabase.storage.from('student-deliveries').remove(draft.entries.map(f => f.file_path)))
          checked(await supabase.rpc('discard_file_batch', { p_batch: draft.id }))
        }
        retry.current = null
      } catch { setError('임시 파일 정리에 실패했습니다. 다시 닫기를 눌러 주세요.'); setBusy(false); return }
    }
    onClose()
  }
  async function removeAttachment() {
    setBusy(true); setError('')
    try {
      checked(await retryDeliveryRequest(() => supabase.functions.invoke('distribution-files', {
        body: { file_id: deleteFile.id }, signal: AbortSignal.timeout(45000),
      })))
      const deletedAt = new Date().toISOString()
      const replace = f => f.id === deleteFile.id ? { ...f, deleted_at: deletedAt } : f
      setHistory(prev => prev.map(b => ({ ...b, file_batch_files: b.file_batch_files.map(replace) })))
      setStatus(prev => prev ? { ...prev, batch: { ...prev.batch, file_batch_files: prev.batch.file_batch_files.map(replace) } } : prev)
      setDeleteFile(null)
      toast('첨부파일을 저장소에서 삭제했습니다. 쪽지와 수신 이력은 유지됩니다.')
    } catch { setError('첨부파일 삭제를 완료하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  return <Dialog open title="쪽지/파일 보내기" onClose={close} wide className="distribution-dialog">
    <div className="distribution-composer">
      <p className="distribution-intro"><IconMail size={18} stroke={1.75} /> 학생에게 쪽지와 자료를 한 번에 전달하세요.</p>
      {error && <p role="alert" className="distribution-error">{error}</p>}
      <div className="distribution-fields">
        <label className="distribution-field"><span>대상 기수</span><select className="input" aria-label="대상 기수" value={target} disabled={locked} onChange={e => { setTarget(e.target.value); setHistoryPage(0) }}>
          <option value="">기수를 선택하세요</option>{cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="distribution-field"><span>제목</span><input className="input" aria-label="파일 제목" placeholder="전달할 내용의 제목을 입력하세요" maxLength={200} value={title} disabled={locked} onChange={e => setTitle(e.target.value)} /></label>
      </div>
      <section className="distribution-field">
        <div className="distribution-section-label">쪽지 내용 <span>파일만 보낼 때는 생략 가능</span></div>
        <div className={locked ? 'distribution-editor-locked' : ''}>
          <Suspense fallback={<p className="distribution-empty">편집기 준비 중…</p>}><RichEditor key={editorKey} value={memo} onChange={setMemo} minHeight={120} compact /></Suspense>
        </div>
      </section>
      <section className="distribution-field">
        <div className="distribution-section-label">첨부파일 <span>선택 · 최대 10개</span></div>
        <button type="button" className={`dropzone distribution-dropzone ${dragover ? 'dragover' : ''}`} aria-label="첨부파일 선택" disabled={locked}
          onClick={() => fileInput.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!locked) { e.dataTransfer.dropEffect = 'copy'; setDragover(true) } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragover(false) }}
          onDrop={e => { e.preventDefault(); setDragover(false); addFiles([...e.dataTransfer.files]) }}>
          <IconUpload size={24} stroke={1.5} />
          <span className="distribution-drop-title">파일을 끌어다 놓거나 클릭하여 선택</span>
          <span className="distribution-hint">여러 파일 추가 가능 · LMS 용량·확장자 설정 적용</span>
        </button>
        <input ref={fileInput} type="file" multiple hidden aria-label="전송 파일" disabled={locked} onChange={e => { addFiles([...e.target.files]); e.target.value = '' }} />
        {!!files.length && <div className="distribution-files" aria-label="선택한 첨부파일">
          <div className="distribution-file-total"><span>첨부 {files.length}/10개</span><span>{fmtBytes(files.reduce((n, f) => n + f.size, 0))}</span></div>
          {files.map((f, i) => <div className="distribution-file-row" key={`${f.name}-${i}`}>
            <IconFile size={18} stroke={1.5} /><span className="distribution-file-name">{f.name}</span><span className="distribution-file-size">{fmtBytes(f.size)}</span>
            <button className="icon-btn" aria-label={`${f.name} 제거`} disabled={locked} onClick={() => { setFiles(prev => prev.filter((_, index) => index !== i)); setError('') }}><IconX size={15} /></button>
          </div>)}
        </div>}
      </section>
      <section className="distribution-recipients">
        <div className="distribution-section-label">받는 학생 <span className="distribution-count">{all ? members.length : selected.size}명 선택</span></div>
        <label className="checkbox-row"><input type="checkbox" checked={all} disabled={locked} onChange={e => setAll(e.target.checked)} /> 기수 전체 학생 ({members.length}명)</label>
        {!all && <div className="distribution-member-picker">
          <input className="input" aria-label="학생 이름 검색" placeholder="학생 이름으로 검색" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="distribution-member-list">
            {members.filter(p => p.name.includes(search.trim())).map(p => <label key={p.id} className="checkbox-row"><input type="checkbox" checked={selected.has(p.id)} disabled={locked}
              onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(p.id); else next.delete(p.id); return next })} /> {p.name}</label>)}
            {!members.some(p => p.name.includes(search.trim())) && <p className="distribution-hint">검색 결과가 없습니다.</p>}
          </div>
        </div>}
      </section>
      <div className="distribution-send-row">
        <p className="distribution-hint">접속 중인 학생은 알림으로,<br />미접속 학생은 다음 로그인 때 확인합니다.</p>
        <button className="btn btn-primary" disabled={busy || !target || (!files.length && isBlankHtml(memo)) || !title.trim() || !members.length || (!all && !selected.size)} onClick={send}>
          <IconSend size={16} stroke={1.75} /> {busy ? progress || '준비 중…' : hasDraft ? '전송 다시 시도' : `${all ? members.length : selected.size}명에게 보내기`}
        </button>
      </div>
      <details className="distribution-disclosure" open={historyOpen} onToggle={e => { setHistoryOpen(e.currentTarget.open); if (!e.currentTarget.open) setStatus(null) }}>
        <summary><IconHistory size={18} stroke={1.75} /><span className="distribution-summary-copy"><strong>전송 이력 · 수신 현황</strong><small>지난 전송 내역과 첨부파일을 관리하세요.</small></span><IconChevronDown className="distribution-chevron" size={18} /></summary>
        <div className="distribution-history">
          {historyLoading && <p className="distribution-empty" role="status">전송 이력을 불러오는 중…</p>}
          {!historyLoading && !history.length && <p className="distribution-empty">전송 이력이 없습니다.</p>}
          {history.map(batch => <details className="distribution-history-item" key={batch.id} open={status?.batch.id === batch.id}
            onToggle={e => {
              if (e.currentTarget.open) setStatus(prev => prev?.batch.id === batch.id ? prev : { batch, rows: [], requests: [], loading: true })
              else setStatus(prev => prev?.batch.id === batch.id ? null : prev)
            }}>
            <summary><span className="distribution-history-icon">{batch.file_batch_files.length ? <IconPaperclip size={17} /> : <IconMail size={17} />}</span>
              <span className="distribution-summary-copy"><strong>{batch.title}</strong><small>{fmtDate(batch.sent_at || batch.created_at, true)} · {batch.status === 'sent' ? (batch.file_batch_files.length ? `첨부 ${batch.file_batch_files.filter(f => !f.deleted_at).length}개` : '쪽지') : '미전송 임시 항목'}</small></span>
              <span className="distribution-row-action">{batch.status === 'sent' ? `수신 현황${profile.role === 'super_admin' && batch.file_batch_files.length ? ' · 첨부 관리' : ''}` : '임시 파일 관리'}</span><IconChevronDown className="distribution-chevron" size={16} />
            </summary>
            {status?.batch.id === batch.id && <div className="distribution-status">
              {batch.status === 'draft' ? <div className="distribution-draft"><p className="distribution-hint">학생에게 전송되지 않은 임시 항목입니다.</p>
                {batch.sender_id === profile.id && <button className="btn btn-white btn-sm" disabled={busy} onClick={() => discard(batch)}>임시 파일 정리</button>}</div>
                : <>
                  {!!status.batch.file_batch_files.length && <section className="distribution-attachments">
                    <div className="distribution-section-label">첨부파일 <span>{status.batch.file_batch_files.length}개</span></div>
                    {status.batch.file_batch_files.map(file => <div className={`distribution-file-row ${file.deleted_at ? 'is-deleted' : ''}`} key={file.id}>
                      <IconFile size={18} stroke={1.5} /><span className="distribution-file-name">{file.filename}<small>{fmtBytes(file.size_bytes)}{file.deleted_at ? ' · 삭제됨' : ''}</small></span>
                      {file.deleted_at ? <span className="distribution-state">삭제됨</span> : profile.role === 'super_admin' && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setDeleteFile(file)}>파일 삭제</button>}
                    </div>)}
                  </section>}
                  {status.loading ? <p className="distribution-empty" role="status">수신 현황을 불러오는 중…</p> : <>
                    {status.error && <p className="distribution-error" role="alert">수신 현황을 갱신하지 못했습니다. 잠시 후 다시 확인합니다.</p>}
                    <div className="distribution-stats" aria-label="수신 요약">
                      {[['대상 학생', status.rows.length], ['알림 수신', status.rows.filter(r => r.received_at).length], ['내용 확인', status.rows.filter(r => r.seen_at).length], ['다운로드 요청', new Set(status.requests.map(r => r.user_id)).size]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}<small>명</small></strong></div>)}
                    </div>
                    <div className="table-wrap distribution-table-wrap"><table className="data-table distribution-table" aria-label="학생별 수신 현황">
                      <thead><tr><th scope="col">학생</th><th scope="col">알림 수신</th><th scope="col">내용 확인</th><th scope="col">다운로드 요청</th></tr></thead>
                      <tbody>{status.rows.length ? status.rows.map(r => <tr key={r.user_id}><td><strong>{r.recipient_name}</strong></td>
                        <td data-label="알림 수신"><span className={`distribution-state ${r.received_at ? 'is-done' : ''}`}>{r.received_at ? '수신 완료' : '대기'}</span>{r.received_at && <time dateTime={r.received_at}>{fmtDate(r.received_at, true)}</time>}</td>
                        <td data-label="내용 확인"><span className={`distribution-state ${r.seen_at ? 'is-done' : ''}`}>{r.seen_at ? '확인 완료' : '미확인'}</span>{r.seen_at && <time dateTime={r.seen_at}>{fmtDate(r.seen_at, true)}</time>}</td>
                        <td data-label="다운로드 요청">{status.requests.filter(d => d.user_id === r.user_id).map(d => status.batch.file_batch_files.find(f => f.id === d.file_id)?.filename).filter(Boolean).join(', ') || <span className="distribution-hint">없음</span>}</td>
                      </tr>) : <tr><td colSpan={4} className="distribution-empty">수신 대상이 없습니다.</td></tr>}</tbody>
                    </table></div>
                    <p className="distribution-hint">다운로드 요청은 버튼을 누른 기록이며, PC 저장 완료나 파일 열람을 의미하지 않습니다.</p>
                  </>}
                </>}
            </div>}
          </details>)}
          <div className="distribution-pagination"><button className="btn btn-white btn-sm" disabled={busy || !historyPage} onClick={() => { setStatus(null); setHistoryPage(p => p - 1) }}>이전</button>
            <span>{historyPage + 1} 페이지</span><button className="btn btn-white btn-sm" disabled={busy || history.length < 20} onClick={() => { setStatus(null); setHistoryPage(p => p + 1) }}>다음</button></div>
        </div>
      </details>
      <details className="distribution-disclosure distribution-legacy" onToggle={e => setLegacyOpen(e.currentTarget.open)}>
        <summary><IconMail size={18} stroke={1.75} /><span className="distribution-summary-copy"><strong>이전 쪽지 이력 · 수정 · 재발송</strong></span><IconChevronDown className="distribution-chevron" size={18} /></summary>
        {legacyOpen && <div className="distribution-legacy-body"><AdminPushComposer embedded cohortId={target} cohortName={cohorts.find(c => c.id === target)?.name} /></div>}
      </details>
    </div>
    <ConfirmDialog open={!!deleteFile} busy={busy} danger title="첨부파일 영구 삭제"
      message={`“${deleteFile?.filename || ''}” 파일을 저장소에서 영구 삭제할까요? 모든 수신 학생의 다운로드가 중단됩니다. 쪽지 내용과 수신 이력은 유지됩니다.`}
      confirmLabel="파일 영구 삭제" onConfirm={removeAttachment} onClose={() => setDeleteFile(null)} />
  </Dialog>
}
