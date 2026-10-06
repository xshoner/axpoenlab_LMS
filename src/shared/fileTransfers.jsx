import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { IconMail, IconDownload, IconTrash } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, ConfirmDialog, useToast } from './ui'
import { fmtBytes, fmtDate } from '../lib/helpers'
import { PushBody, LegacyAction } from './push'
const FileSenderDialog = lazy(() => import('./FileSenderDialog'))
const BUCKET = 'student-deliveries'
export function checked(result) {
  if (result.error) throw result.error
  return result.data
}

export function AdminDistributionButton({ cohortId, cohorts }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="inq-pill distribution-button" aria-label="쪽지/파일" title="학생에게 쪽지 또는 파일 보내기" onClick={() => setOpen(true)}><IconMail size={14} stroke={1.75} /><span>쪽지/파일</span></button>
    {open && <Suspense fallback={<Dialog open title="쪽지/파일" onClose={() => setOpen(false)}>준비 중…</Dialog>}>
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
      const a = document.createElement('a')
      // Storage sets Content-Disposition; let the browser stream bytes directly to disk.
      a.href = data.signedUrl
      a.download = file.filename
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { toast('파일을 다운로드하지 못했습니다. 다시 시도해 주세요.', 'error') }
    finally { setBusy(null) }
  }
  return <div className="stack" style={{ gap: 12 }}>
    {batch.legacy && <><PushBody body={batch.legacy.body} /><LegacyAction item={batch.legacy} /></>}
    {batch.body_html && <PushBody body={batch.body_html} />}
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

function legacySeen(userId) {
  try { return new Set(JSON.parse(localStorage.getItem(`ax-distribution-seen:${userId}`) || localStorage.getItem('ax-push-seen') || '[]')) } catch { return new Set() }
}
async function inboxDetail(row) {
  if (row.delivery_id) return row.file_batches
  return checked(await supabase.from('file_batches').select('id,title,memo,body_html,sent_at,file_batch_files(*)')
    .eq('id', row.batch_id).single().abortSignal(AbortSignal.timeout(10000)))
}
export function StudentDistributionInbox({ floating = false }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [seen, setSeen] = useState(() => legacySeen(profile?.id))
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const seenRef = useRef(seen)
  useEffect(() => { seenRef.current = seen }, [seen])
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
        const [fileResult, messageResult, hiddenResult] = await Promise.all([
          supabase.from('file_recipients')
            .select('batch_id,received_at,seen_at,file_batches!inner(id,title,sent_at,file_batch_files(id))')
            .eq('user_id', profile.id).is('hidden_at', null).order('created_at', { ascending: false }).range(page * 20, page * 20 + 19),
          page === 0 ? supabase.from('push_deliveries').select('id,body,sender_name,sent_at,action_url,action_label').order('sent_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
          page === 0 ? supabase.from('push_hidden').select('delivery_id') : Promise.resolve({ data: [] }),
        ])
        const files = checked(fileResult) || []
        const hidden = new Set((checked(hiddenResult) || []).map(x => x.delivery_id))
        const legacy = (checked(messageResult) || []).filter(m => !hidden.has(m.id)).map(m => ({
          batch_id: `legacy:${m.id}`, delivery_id: m.id, seen_at: seenRef.current.has(m.id) ? true : null,
          file_batches: { id: `legacy:${m.id}`, title: '관리자 쪽지', legacy: m, sent_at: m.sent_at, file_batch_files: [] },
        }))
        const rows = [...files, ...legacy].sort((a, b) => new Date(b.file_batches.sent_at) - new Date(a.file_batches.sent_at))
        if (!alive) return
        setItems(rows); setHasMore(files.length === 20); setError(false)
        // Fetching the authorized inbox confirms receipt; opening details confirms reading.
        await Promise.all(files.filter(x => !x.received_at).map(async row => {
          checked(await supabase.rpc('ack_file_batch', { p_batch: row.batch_id }))
        }))
        if (page === 0 && !currentDetail.current) {
          const row = rows.find(x => !x.seen_at && !popped.current.has(x.batch_id))
          if (row) {
            const batch = await inboxDetail(row)
            if (alive && !currentDetail.current) {
              popped.current.add(row.batch_id)
              setDetail(batch)
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'push_deliveries' }, () => {
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
    if (detail.legacy) {
      const id = detail.legacy.id
      setSeen(prev => {
        const next = new Set([...prev, id])
        try { localStorage.setItem(`ax-distribution-seen:${profile.id}`, JSON.stringify([...next].slice(-500))) } catch { /* private browser */ }
        return next
      })
      setItems(prev => prev.map(x => x.batch_id === detail.id ? { ...x, seen_at: true } : x))
      return
    }
    supabase.rpc('ack_file_batch', { p_batch: detail.id, p_seen: true }).then(result => {
      if (!result.error) setItems(prev => prev.map(x => x.batch_id === detail.id ? { ...x, seen_at: new Date().toISOString() } : x))
    })
  }, [detail?.id])

  async function view(row) {
    try {
      setDetail(await inboxDetail(row))
    } catch { toast('파일 정보를 확인하지 못했습니다. 다시 시도해 주세요.', 'error') }
  }
  async function hideMessage() {
    setDeleting(true)
    try {
      if (deleteTarget.delivery_id) checked(await supabase.from('push_hidden').upsert({ user_id: profile.id, delivery_id: deleteTarget.delivery_id }, { onConflict: 'user_id,delivery_id' }))
      else checked(await supabase.rpc('hide_distribution', { p_batch: deleteTarget.batch_id }))
      setItems(prev => prev.filter(x => x.batch_id !== deleteTarget.batch_id)); setDeleteTarget(null)
      toast('내 받은 목록에서 삭제했습니다.')
    } catch { toast('삭제하지 못했습니다.', 'error') }
    finally { setDeleting(false) }
  }
  return <>
    <button className={`inq-pill distribution-button ${unread ? 'hot' : ''}`} aria-label="쪽지/파일" title="받은 쪽지와 첨부파일" style={floating ? { position: 'fixed', top: 12, right: 16, zIndex: 90 } : undefined} onClick={() => { setPage(0); setOpen(true) }}>
      <IconMail size={14} stroke={1.75} /><span>쪽지/파일</span> {unread > 0 && <span className="push-unread">{unread}</span>}
    </button>
    <Dialog open={open} title="받은 쪽지/파일" onClose={() => setOpen(false)} wide>
      <div className="stack" style={{ gap: 10 }}>
        {error && <p role="alert">목록을 불러오지 못했습니다. <button className="btn btn-white btn-sm" onClick={() => reloadRef.current?.()}>다시 시도</button></p>}
        {!items.length && !error && <p>받은 쪽지/파일이 없습니다.</p>}
        <div className="stack" style={{ gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
        {items.map(row => <div className="row" key={row.batch_id} style={{ gap: 6 }}><button className="btn btn-white" style={{ flex: 1, justifyContent: 'space-between', textAlign: 'left' }} onClick={() => view(row)}>
          <span>{row.file_batches.title} <small>{row.file_batches.file_batch_files.length ? `첨부 ${row.file_batches.file_batch_files.length}개` : '쪽지'} {!row.seen_at && '· 새 소식'}</small></span>
          <small>{fmtDate(row.file_batches.sent_at)}</small>
        </button><button className="icon-btn danger" title="받은 항목 삭제" onClick={() => setDeleteTarget(row)}><IconTrash size={14} /></button></div>)}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-white btn-sm" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button>
          <span>{page + 1} 페이지</span>
          <button className="btn btn-white btn-sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>다음</button>
        </div>
      </div>
    </Dialog>
    <ConfirmDialog open={!!deleteTarget} busy={deleting} danger title="받은 항목 삭제" message="내 받은 목록에서 삭제할까요? 관리자 전송 기록과 다른 학생의 목록은 유지됩니다." onConfirm={hideMessage} onClose={() => setDeleteTarget(null)} confirmLabel="삭제" />
    <Dialog open={!!detail} title={detail?.title || '파일 도착'} onClose={() => setDetail(null)} wide>
      {detail && <FileBatchDetail batch={detail} />}
    </Dialog>
  </>
}
