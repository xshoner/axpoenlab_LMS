import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { readAll } from '../lib/queries'
import { getSettings, extOf, fmtBytes, fmtDate, storageSafeName } from '../lib/helpers'
import { useAuth } from './auth'
import { Dialog, ConfirmDialog, useToast } from './ui'
import { retryDeliveryRequest } from '../lib/deliveryRequests'
import { checked } from './fileTransfers'
import { AdminPushComposer, isBlankHtml } from './push'
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
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [search, setSearch] = useState('')
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [error, setError] = useState('')
  const [deleteFile, setDeleteFile] = useState(null)
  const fileInput = useRef(null)
  const retry = useRef(null)

  async function loadHistory() {
    let q = supabase.from('file_batches').select('id,title,status,sender_id,created_at,sent_at,cohort_id,file_batch_files(id,filename,size_bytes,deleted_at)')
      .order('created_at', { ascending: false }).range(historyPage * 20, historyPage * 20 + 19)
    if (target) q = q.eq('cohort_id', target)
    setHistory(checked(await q) || [])
  }
  useEffect(() => {
    let alive = true
    setMembers([]); setSelected(new Set()); setAll(true); setError('')
    if (target) readAll(() => supabase.from('cohort_members').select('user_id,profiles!inner(id,name,status,role)')
      .eq('cohort_id', target).eq('profiles.status', 'active').eq('profiles.role', 'student').order('user_id'))
      .then(rows => { if (alive) setMembers(rows.map(x => x.profiles)) })
      .catch(() => { if (alive) setError('학생 목록을 불러오지 못했습니다. 창을 다시 열어 주세요.') })
    return () => { alive = false }
  }, [target])
  useEffect(() => { loadHistory().catch(() => setError('전송 이력을 불러오지 못했습니다.')) }, [target, historyPage])
  useEffect(() => {
    if (!status) return
    let alive = true, running = false
    async function refresh() {
      if (running) return
      running = true
      try {
        const rows = await readAll(() => supabase.from('file_recipients').select('*').eq('batch_id', status.batch.id).order('user_id'))
        const fileIds = status.batch.file_batch_files.map(f => f.id)
        const requests = fileIds.length ? await readAll(() => supabase.from('file_download_requests').select('file_id,user_id,requested_at')
          .in('file_id', fileIds).order('file_id').order('user_id')) : []
        if (alive) setStatus(prev => prev?.batch.id === status.batch.id ? { ...prev, rows, requests } : prev)
      } catch { if (alive) setError('수신 현황을 갱신하지 못했습니다.') }
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
  return <Dialog open title="쪽지/파일 보내기" onClose={close} wide>
    <div className="stack" style={{ gap: 12 }}>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <label>대상 기수 <select className="input" aria-label="대상 기수" value={target} disabled={locked} onChange={e => { setTarget(e.target.value); setHistoryPage(0) }}>
        <option value="">기수를 선택하세요</option>{cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label>제목 <input className="input" aria-label="파일 제목" maxLength={200} value={title} disabled={locked} onChange={e => setTitle(e.target.value)} /></label>
      <div><div className="t-label mb-8">쪽지 내용 (파일만 보낼 때는 생략 가능)</div>
        <div style={locked ? { pointerEvents: 'none', opacity: .65 } : undefined}>
          <Suspense fallback={<p>편집기 준비 중…</p>}><RichEditor key={editorKey} value={memo} onChange={setMemo} minHeight={140} compact /></Suspense>
        </div>
      </div>
      <label>첨부파일 (선택, 최대 10개, LMS 용량·확장자 설정 적용)
        <input ref={fileInput} type="file" multiple aria-label="전송 파일" disabled={locked} onChange={e => setFiles([...e.target.files])} />
      </label>
      {files.map((f, i) => <small key={i}>{f.name} · {fmtBytes(f.size)}</small>)}
      <label><input type="checkbox" checked={all} disabled={locked} onChange={e => setAll(e.target.checked)} /> 기수 전체 학생 ({members.length}명)</label>
      {!all && <div><input className="input" aria-label="학생 이름 검색" placeholder="학생 이름 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {members.filter(p => p.name.includes(search.trim())).map(p => <label key={p.id} style={{ display: 'block' }}><input type="checkbox" checked={selected.has(p.id)} disabled={locked}
          onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(p.id); else next.delete(p.id); return next })} /> {p.name}</label>)}
      </div></div>}
      <p className="t-caption">쪽지만 보내거나 파일을 함께 보낼 수 있습니다. 접속 중인 학생에게 알림이 표시되며 미접속자는 다음 로그인 때 확인합니다.</p>
      <button className="btn btn-primary" disabled={busy || !target || (!files.length && isBlankHtml(memo)) || !title.trim() || !members.length || (!all && !selected.size)} onClick={send}>
        {busy ? progress || '준비 중…' : hasDraft ? '전송 다시 시도' : `${all ? members.length : selected.size}명에게 보내기`}
      </button>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <h3 className="t-h3">전송 이력 · 수신 현황</h3>
        {!history.length && <p>전송 이력이 없습니다.</p>}
        {history.map(batch => <div className="row" key={batch.id} style={{ gap: 8, marginTop: 8 }}>
          <span style={{ flex: 1 }}>{batch.title} <small>{batch.status === 'sent' ? `${fmtDate(batch.sent_at, true)} · ${batch.file_batch_files.length ? `첨부 ${batch.file_batch_files.filter(f => !f.deleted_at).length}개${batch.file_batch_files.some(f => f.deleted_at) ? ' · 삭제 파일 있음' : ''}` : '쪽지'}` : '미전송 임시 항목'}</small></span>
          {batch.status === 'sent' ? <button className="btn btn-white btn-sm" disabled={busy} onClick={() => setStatus({ batch, rows: [], requests: [] })}>수신 현황{profile.role === 'super_admin' && batch.file_batch_files.length ? ' · 첨부 관리' : ''}</button>
            : batch.sender_id === profile.id && <button className="btn btn-white btn-sm" disabled={busy} onClick={() => discard(batch)}>임시 파일 정리</button>}
        </div>)}
        <div className="row mt-8" style={{ gap: 8 }}><button className="btn btn-white btn-sm" disabled={!historyPage} onClick={() => setHistoryPage(p => p - 1)}>이전</button>
          <span>{historyPage + 1} 페이지</span><button className="btn btn-white btn-sm" disabled={history.length < 20} onClick={() => setHistoryPage(p => p + 1)}>다음</button></div>
      </div>
      <details onToggle={e => setLegacyOpen(e.currentTarget.open)}><summary>이전 쪽지 이력 · 수정 · 재발송</summary>
        {legacyOpen && <AdminPushComposer embedded cohortId={target} cohortName={cohorts.find(c => c.id === target)?.name} />}
      </details>
    </div>
    <Dialog open={!!status} title={`${status?.batch.title || ''} · 수신 현황`} onClose={() => setStatus(null)} wide>
      {status && <div className="stack" style={{ gap: 8 }}>
        {status.batch.file_batch_files.map(file => <div className="row" key={file.id} style={{ gap: 8 }}>
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{file.filename} · {fmtBytes(file.size_bytes)}{file.deleted_at ? ' · 삭제됨' : ''}</span>
          {profile.role === 'super_admin' && !file.deleted_at && <button className="btn btn-white btn-sm danger" disabled={busy} onClick={() => setDeleteFile(file)}>파일 삭제</button>}
        </div>)}
        <p>대상 {status.rows.length}명 · 알림 수신 {status.rows.filter(r => r.received_at).length}명 · 확인 {status.rows.filter(r => r.seen_at).length}명 · 다운로드 요청 {new Set(status.requests.map(r => r.user_id)).size}명</p>
        <p className="t-caption">다운로드 요청은 버튼을 누른 기록입니다. PC 저장 완료나 파일 열람 여부를 의미하지 않습니다.</p>
        <div style={{ maxHeight: '45vh', overflow: 'auto' }}><table style={{ width: '100%' }}>
          <thead><tr><th>학생</th><th>알림 수신</th><th>확인</th><th>다운로드 요청</th></tr></thead>
          <tbody>{status.rows.map(r => <tr key={r.user_id}><td>{r.recipient_name}</td><td>{r.received_at ? fmtDate(r.received_at, true) : '대기'}</td><td>{r.seen_at ? fmtDate(r.seen_at, true) : '미확인'}</td>
            <td>{status.requests.filter(d => d.user_id === r.user_id).map(d => status.batch.file_batch_files.find(f => f.id === d.file_id)?.filename).join(', ') || '없음'}</td></tr>)}</tbody>
        </table></div>
      </div>}
    </Dialog>
    <ConfirmDialog open={!!deleteFile} busy={busy} danger title="첨부파일 영구 삭제"
      message={`“${deleteFile?.filename || ''}” 파일을 저장소에서 영구 삭제할까요? 모든 수신 학생의 다운로드가 중단됩니다. 쪽지 내용과 수신 이력은 유지됩니다.`}
      confirmLabel="파일 영구 삭제" onConfirm={removeAttachment} onClose={() => setDeleteFile(null)} />
  </Dialog>
}
