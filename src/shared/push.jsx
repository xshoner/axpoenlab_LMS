import { useCallback, useEffect, useRef, useState } from 'react'
import { IconMail, IconSend, IconPencil, IconTrash, IconX, IconRepeat } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, ConfirmDialog, useToast } from './ui'
import { fmtDate } from '../lib/helpers'

const SEEN_KEY = 'ax-push-seen'

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) } catch { return new Set() }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-500))) } catch { /* ignore */ }
}

/* ============ 학생: 쪽지 버튼 + 강제 팝업 + 받은 쪽지함 ============ */
export function StudentPushInbox({ cohortId }) {
  const [items, setItems] = useState([])
  const [popup, setPopup] = useState(null)      // 실시간 수신 시 강제로 뜨는 팝업
  const [inboxOpen, setInboxOpen] = useState(false)
  const [seen, setSeen] = useState(loadSeen)
  const cohortRef = useRef(cohortId)
  cohortRef.current = cohortId

  const load = useCallback(async () => {
    const { data } = await supabase.from('push_deliveries')
      .select('id, body, sender_name, sent_at, cohort_id')
      .order('sent_at', { ascending: false }).limit(100)
    setItems(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  // 관리자 발송(push_deliveries insert)을 실시간으로 받아 팝업 표시. RLS로 내 기수·전체 대상만 전달된다.
  useEffect(() => {
    const ch = supabase.channel('lms-push-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'push_deliveries' }, (payload) => {
        const row = payload.new
        if (row.cohort_id && cohortRef.current && row.cohort_id !== cohortRef.current) return
        setItems((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]))
        setPopup(row)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  function markSeen(ids) {
    setSeen((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      saveSeen(next)
      return next
    })
  }

  function closePopup() {
    if (popup) markSeen([popup.id])
    setPopup(null)
  }

  function openInbox() {
    setInboxOpen(true)
    markSeen(items.map((x) => x.id))
  }

  const unread = items.filter((x) => !seen.has(x.id)).length

  return (
    <>
      <button type="button" className={`inq-pill ${unread > 0 ? 'hot' : ''}`} title="관리자가 보낸 쪽지" onClick={openInbox}>
        <IconMail size={14} stroke={1.75} />
        <span>쪽지 <span className="tnum inq-count">{items.length}건</span></span>
        {unread > 0 && <span className="push-unread">{unread}</span>}
      </button>

      {popup && (
        <div className="dialog-overlay" style={{ zIndex: 150 }}>
          <div className="dialog push-popup" role="alertdialog" aria-modal="true">
            <div className="row mb-16" style={{ gap: 8 }}>
              <IconMail size={20} stroke={1.75} color="var(--primary)" />
              <h2 className="t-h2">관리자 쪽지</h2>
              <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={closePopup} aria-label="닫기">
                <IconX size={18} stroke={1.75} />
              </button>
            </div>
            <div className="push-body">{popup.body}</div>
            <div className="t-caption muted-soft mt-8">
              {popup.sender_name || '관리자'} · {fmtDate(popup.sent_at, true)}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={closePopup}>확인</button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={inboxOpen} title={`받은 쪽지 (${items.length}건)`} onClose={() => setInboxOpen(false)}>
        {items.length === 0 ? (
          <p className="t-muted-sm">받은 쪽지가 없습니다.</p>
        ) : (
          <div className="stack" style={{ gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {items.map((m) => (
              <div key={m.id} className="push-item">
                <div className="push-body">{m.body}</div>
                <div className="t-caption muted-soft mt-8">{m.sender_name || '관리자'} · {fmtDate(m.sent_at, true)}</div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </>
  )
}

/* ============ 관리자: 쪽지 작성·발송·이력(재발송/수정/삭제) ============ */
export function AdminPushComposer({ cohortId, cohortName }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [editing, setEditing] = useState(null)   // 수정 중인 push_messages 행
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('push_messages').select('*')
      .order('created_at', { ascending: false }).limit(50)
    setHistory(data || [])
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const senderName = profile?.nickname || profile?.name || '관리자'
  const target = cohortId ? `${cohortName} 학생` : '전체 기수 학생'

  async function deliver(messageId, text) {
    const { error } = await supabase.from('push_deliveries').insert({
      message_id: messageId, cohort_id: cohortId || null, body: text, sender_name: senderName,
    })
    if (error) throw error
    const row = history?.find((h) => h.id === messageId)
    await supabase.from('push_messages')
      .update({ send_count: (row?.send_count || 0) + 1, last_sent_at: new Date().toISOString() })
      .eq('id', messageId)
  }

  async function send() {
    const text = body.trim()
    if (!text) { toast('쪽지 내용을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      let id = editing?.id
      if (id) {
        const { error } = await supabase.from('push_messages')
          .update({ body: text, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('push_messages')
          .insert({ sender_id: profile.id, body: text }).select('id').single()
        if (error) throw error
        id = data.id
      }
      await deliver(id, text)
      toast(`${target}에게 쪽지를 보냈습니다.`)
      setBody(''); setEditing(null)
      load()
    } catch (e) {
      toast(`발송에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  async function saveEditOnly() {
    const text = body.trim()
    if (!editing || !text) return
    setBusy(true)
    const { error } = await supabase.from('push_messages')
      .update({ body: text, updated_at: new Date().toISOString() }).eq('id', editing.id)
    setBusy(false)
    if (error) { toast('수정에 실패했습니다.', 'error'); return }
    toast('쪽지가 수정되었습니다. (발송되지 않음)')
    setBody(''); setEditing(null)
    load()
  }

  async function resend(m) {
    setBusy(true)
    try {
      await deliver(m.id, m.body)
      toast(`${target}에게 다시 보냈습니다.`)
      load()
    } catch (e) {
      toast(`재발송에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  async function doDelete() {
    setBusy(true)
    const { error } = await supabase.from('push_messages').delete().eq('id', deleteTarget.id)
    setBusy(false)
    setDeleteTarget(null)
    if (error) { toast('삭제에 실패했습니다.', 'error'); return }
    if (editing?.id === deleteTarget.id) { setEditing(null); setBody('') }
    toast('쪽지 이력이 삭제되었습니다.')
    load()
  }

  return (
    <>
      <button type="button" className="inq-pill" title="학생에게 쪽지 팝업 보내기" onClick={() => setOpen(true)}>
        <IconMail size={14} stroke={1.75} />
        <span>쪽지</span>
      </button>

      <Dialog open={open} title="학생에게 쪽지 보내기" onClose={() => setOpen(false)}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="t-caption" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            대상: {target} (현재 접속 중인 학생 화면에 팝업이 즉시 표시됩니다)
          </div>
          <textarea className="textarea" style={{ minHeight: 110 }} maxLength={1000}
            placeholder="전달할 내용을 입력하세요…" value={body}
            onChange={(e) => setBody(e.target.value)} />
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            {editing && (
              <>
                <span className="t-caption muted-soft" style={{ marginRight: 'auto' }}>이력 항목 수정 중</span>
                <button className="btn btn-white btn-sm" disabled={busy} onClick={() => { setEditing(null); setBody('') }}>취소</button>
                <button className="btn btn-white btn-sm" disabled={busy || !body.trim()} onClick={saveEditOnly}>수정만 저장</button>
              </>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()} onClick={send}>
              <IconSend size={14} stroke={1.75} /> {busy ? '처리 중…' : editing ? '수정 후 보내기' : '보내기'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="t-label mb-8">보낸 쪽지 이력</div>
            {history === null ? (
              <div className="t-caption muted-soft">불러오는 중…</div>
            ) : history.length === 0 ? (
              <div className="t-caption muted-soft">아직 보낸 쪽지가 없습니다.</div>
            ) : (
              <div className="stack" style={{ gap: 6, maxHeight: '38vh', overflowY: 'auto' }}>
                {history.map((m) => (
                  <div key={m.id} className={`push-item ${editing?.id === m.id ? 'editing' : ''}`}>
                    <div className="push-body" style={{ fontSize: 13 }}>{m.body}</div>
                    <div className="row mt-8" style={{ gap: 4 }}>
                      <span className="t-caption muted-soft tnum">
                        {m.send_count}회 발송{m.last_sent_at ? ` · 최근 ${fmtDate(m.last_sent_at, true)}` : ''}
                      </span>
                      <span style={{ marginLeft: 'auto' }} />
                      <button className="icon-btn" title="다시 보내기" disabled={busy} onClick={() => resend(m)}>
                        <IconRepeat size={15} stroke={1.75} />
                      </button>
                      <button className="icon-btn" title="수정" disabled={busy} onClick={() => { setEditing(m); setBody(m.body) }}>
                        <IconPencil size={15} stroke={1.75} />
                      </button>
                      <button className="icon-btn danger" title="삭제" disabled={busy} onClick={() => setDeleteTarget(m)}>
                        <IconTrash size={15} stroke={1.75} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} danger busy={busy} title="쪽지 이력 삭제"
        message="이 쪽지를 이력에서 삭제합니다. 학생 쪽지함에 이미 전달된 내용은 유지됩니다."
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
    </>
  )
}
