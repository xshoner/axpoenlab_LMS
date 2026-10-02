import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { IconFiles, IconDownload } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, useToast } from './ui'
import { fmtBytes, fmtDate } from '../lib/helpers'
const FileSenderDialog = lazy(() => import('./FileSenderDialog'))
const BUCKET = 'student-deliveries'
export function checked(result) {
  if (result.error) throw result.error
  return result.data
}

export function AdminFileSender({ cohortId, cohorts }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="inq-pill" onClick={() => setOpen(true)}><IconFiles size={14} /> 파일 보내기</button>
    {open && <Suspense fallback={<Dialog open title="파일 보내기" onClose={() => setOpen(false)}>준비 중…</Dialog>}>
      <FileSenderDialog cohortId={cohortId} cohorts={cohorts} onClose={() => setOpen(false)} />
    </Suspense>}
  </>
}

export function FileBatchDetail({ batch }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  async function download(file) {
    setBusy(file.id)
    try {
      const data = checked(await supabase.storage.from(BUCKET).createSignedUrl(file.file_path, 300, { download: file.filename }))
      checked(await supabase.rpc('record_file_download', { p_file: file.id }))
      const response = await fetch(data.signedUrl)
      if (!response.ok) throw new Error('Download failed')
      const objectUrl = URL.createObjectURL(await response.blob())
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
    } catch { toast('파일을 다운로드하지 못했습니다. 다시 시도해 주세요.', 'error') }
    finally { setBusy(null) }
  }
  return <div className="stack" style={{ gap: 12 }}>
    {batch.memo && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{batch.memo}</p>}
    <span className="t-caption muted-soft">{fmtDate(batch.sent_at, true)}</span>
    {(batch.file_batch_files || []).map(f => <div className="row" key={f.id} style={{ gap: 8 }}>
      <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{f.filename} <small>({fmtBytes(f.size_bytes)})</small></span>
      <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => download(f)}>
        <IconDownload size={14} /> {busy === f.id ? '준비 중…' : '다운로드'}
      </button>
    </div>)}
  </div>
}

export function StudentFileInbox({ floating = false }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(0)
  const reloadRef = useRef(null)
  const popped = useRef(new Set())
  const currentDetail = useRef(null)
  useEffect(() => { currentDetail.current = detail }, [detail])
  const unread = items.filter(x => !x.seen_at).length

  useEffect(() => {
    if (!profile?.id) return
    let alive = true, running = false, pending = false
    async function load() {
      if (running) { pending = true; return }
      running = true
      try {
        const rows = checked(await supabase.from('file_recipients')
          .select('batch_id,received_at,seen_at,file_batches!inner(id,title,memo,sent_at,file_batch_files(*))')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).range(page * 20, page * 20 + 19)) || []
        if (!alive) return
        setItems(rows); setError(false)
        // Fetching the authorized inbox confirms receipt; opening details confirms reading.
        await Promise.all(rows.filter(x => !x.received_at).map(async row => {
          checked(await supabase.rpc('ack_file_batch', { p_batch: row.batch_id }))
        }))
        if (page === 0 && !currentDetail.current) {
          const row = rows.find(x => !x.seen_at && !popped.current.has(x.batch_id))
          if (row) {
            popped.current.add(row.batch_id)
            if (alive) {
              setDetail(row.file_batches)
            }
          }
        }
      } catch { if (alive) setError(true) }
      finally { running = false; if (pending && alive) { pending = false; void load() } }
    }
    reloadRef.current = load
    void load()
    const channel = supabase.channel(`file-inbox:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'file_recipients', filter: `user_id=eq.${profile.id}` }, () => {
        if (page) setPage(0)
        else void load()
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void load() })
    const refresh = () => { if (!document.hidden) void load() }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      alive = false; clearInterval(timer); supabase.removeChannel(channel)
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [profile?.id, page])

  useEffect(() => {
    if (!detail) return
    supabase.rpc('ack_file_batch', { p_batch: detail.id, p_seen: true }).then(result => {
      if (!result.error) setItems(prev => prev.map(x => x.batch_id === detail.id ? { ...x, seen_at: new Date().toISOString() } : x))
    })
  }, [detail?.id])

  async function view(row) {
    try {
      checked(await supabase.rpc('ack_file_batch', { p_batch: row.batch_id, p_seen: true }))
      setItems(prev => prev.map(x => x.batch_id === row.batch_id ? { ...x, seen_at: new Date().toISOString() } : x))
      setDetail(row.file_batches)
    } catch { toast('파일 정보를 확인하지 못했습니다. 다시 시도해 주세요.', 'error') }
  }
  return <>
    <button className={`inq-pill ${unread ? 'hot' : ''}`} style={floating ? { position: 'fixed', top: 12, right: 16, zIndex: 90 } : undefined} onClick={() => { setPage(0); setOpen(true) }}>
      <IconFiles size={14} /> 받은 파일 {unread > 0 && <span className="push-unread">{unread}</span>}
    </button>
    <Dialog open={open} title="받은 파일" onClose={() => setOpen(false)} wide>
      <div className="stack" style={{ gap: 10 }}>
        {error && <p role="alert">목록을 불러오지 못했습니다. <button className="btn btn-white btn-sm" onClick={() => reloadRef.current?.()}>다시 시도</button></p>}
        {!items.length && !error && <p>받은 파일이 없습니다.</p>}
        {items.map(row => <button className="btn btn-white" key={row.batch_id} style={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => view(row)}>
          <span>{row.file_batches.title} {!row.seen_at && <small>새 파일</small>}</span>
          <small>{fmtDate(row.file_batches.sent_at)}</small>
        </button>)}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button>
          <span>{page + 1} 페이지</span>
          <button className="btn btn-white btn-sm" disabled={items.length < 20} onClick={() => setPage(p => p + 1)}>다음</button>
        </div>
      </div>
    </Dialog>
    <Dialog open={!!detail} title={detail?.title || '파일 도착'} onClose={() => setDetail(null)} wide>
      {detail && <FileBatchDetail batch={detail} />}
    </Dialog>
  </>
}
