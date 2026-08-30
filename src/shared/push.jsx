import { useCallback, useEffect, useRef, useState } from 'react'
import { IconMail, IconSend, IconPencil, IconTrash, IconX, IconRepeat } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, ConfirmDialog, useToast } from './ui'
import RichEditor from './RichEditor'
import RichBody from './RichBody'
import { fmtDate } from '../lib/helpers'

const SEEN_KEY = 'ax-push-seen'

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) } catch { return new Set() }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-500))) } catch { /* ignore */ }
}

/* 쪽지 본문은 RichEditor HTML. 예전 텍스트 쪽지(태그 없음)는 줄바꿈을 보존해 HTML로 변환한다. */
function bodyHtml(body) {
  let s = String(body || '')
  // 에디터 오류로 태그가 텍스트로 저장된 과거 쪽지(&lt;a ...&gt;) 복구: 실제 태그가 없고 이스케이프된 태그만 있으면 되돌린다
  if (!/<[a-z][\s\S]*>/i.test(s) && /&lt;[a-z][^&]*&gt;/i.test(s)) {
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  }
  if (/<[a-z][\s\S]*>/i.test(s)) return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}
function isBlankHtml(html) {
  return !String(html || '').replace(/<br\s*\/?>|&nbsp;|<[^>]+>/gi, ' ').trim()
    && !/<img|<iframe|copy-block/i.test(html || '')
}

function PushBody({ body, small }) {
  return (
    <div className="push-body">
      <RichBody html={bodyHtml(body)} style={small ? { fontSize: 13 } : undefined} />
      {/* 예전 방식(별도 링크 버튼)으로 보낸 쪽지 호환 */}
    </div>
  )
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
      .select('id, body, sender_name, sent_at, cohort_id, action_url, action_label')
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
            <PushBody body={popup.body} />
            <LegacyAction item={popup} />
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
                <PushBody body={m.body} />
                <LegacyAction item={m} />
                <div className="t-caption muted-soft mt-8">{m.sender_name || '관리자'} · {fmtDate(m.sent_at, true)}</div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </>
  )
}

/* 예전 방식(action_url 컬럼)으로 발송된 쪽지의 링크 버튼 — 신규 쪽지는 본문 안 링크를 사용 */
function LegacyAction({ item }) {
  if (!item?.action_url) return null
  return (
    <a href={item.action_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm mt-8" style={{ display: 'inline-flex' }}>
      {item.action_label || '링크 열기'}
    </a>
  )
}

/* ============ 관리자: 쪽지 작성(리치 에디터)·발송·이력(재발송/수정/삭제) ============ */
export function AdminPushComposer({ cohortId, cohortName }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [editorKey, setEditorKey] = useState(0)  // RichEditor는 마운트 시에만 value를 읽으므로 초기화·수정 시 재마운트
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
  const blank = isBlankHtml(body)

  function resetComposer(next = '', row = null) {
    setBody(next)
    setEditing(row)
    setEditorKey((k) => k + 1)
  }

  async function deliver(message) {
    const { error } = await supabase.from('push_deliveries').insert({
      message_id: message.id, cohort_id: cohortId || null, body: message.body, sender_name: senderName,
    })
    if (error) throw error
    await supabase.from('push_messages')
      .update({ send_count: (message.send_count || 0) + 1, last_sent_at: new Date().toISOString() })
      .eq('id', message.id)
  }

  async function send() {
    if (blank) { toast('쪽지 내용을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      let message
      if (editing) {
        const { data, error } = await supabase.from('push_messages')
          .update({ body, updated_at: new Date().toISOString() }).eq('id', editing.id).select('*').single()
        if (error) throw error
        message = data
      } else {
        const { data, error } = await supabase.from('push_messages')
          .insert({ sender_id: profile.id, body }).select('*').single()
        if (error) throw error
        message = data
      }
      await deliver(message)
      toast(`${target}에게 쪽지를 보냈습니다.`)
      resetComposer()
      load()
    } catch (e) {
      toast(`발송에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  async function saveEditOnly() {
    if (!editing || blank) return
    setBusy(true)
    const { error } = await supabase.from('push_messages')
      .update({ body, updated_at: new Date().toISOString() }).eq('id', editing.id)
    setBusy(false)
    if (error) { toast('수정에 실패했습니다.', 'error'); return }
    toast('쪽지가 수정되었습니다. (발송되지 않음)')
    resetComposer()
    load()
  }

  async function resend(m) {
    setBusy(true)
    try {
      await deliver(m)
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
    if (error) { toast('삭제에 실패했습니다.', 'error'); setDeleteTarget(null); return }
    if (editing?.id === deleteTarget.id) resetComposer()
    setDeleteTarget(null)
    toast('쪽지 이력이 삭제되었습니다.')
    load()
  }

  return (
    <>
      <button type="button" className="inq-pill" title="학생에게 쪽지 팝업 보내기" onClick={() => setOpen(true)}>
        <IconMail size={14} stroke={1.75} />
        <span>쪽지</span>
      </button>

      <Dialog open={open} title="학생에게 쪽지 보내기" onClose={() => setOpen(false)} wide>
        <div className="stack" style={{ gap: 12 }}>
          <div className="t-caption" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            대상: {target} — 현재 접속 중인 학생 화면에 팝업이 즉시 표시됩니다.
            <span className="muted-soft" style={{ fontWeight: 400 }}> 링크·굵게·명령어/프롬프트 복사 블록은 툴바에서 넣으세요.</span>
          </div>
          <RichEditor key={editorKey} value={body} onChange={setBody} minHeight={140} compact />
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            {editing && (
              <>
                <span className="t-caption muted-soft" style={{ marginRight: 'auto' }}>이력 항목 수정 중</span>
                <button className="btn btn-white btn-sm" disabled={busy} onClick={() => resetComposer()}>취소</button>
                <button className="btn btn-white btn-sm" disabled={busy || blank} onClick={saveEditOnly}>수정만 저장</button>
              </>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || blank} onClick={send}>
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
              <div className="stack" style={{ gap: 6, maxHeight: '34vh', overflowY: 'auto' }}>
                {history.map((m) => (
                  <div key={m.id} className={`push-item ${editing?.id === m.id ? 'editing' : ''}`}>
                    <PushBody body={m.body} small />
                    <LegacyAction item={m} />
                    <div className="row mt-8" style={{ gap: 4 }}>
                      <span className="t-caption muted-soft tnum">
                        {m.send_count}회 발송{m.last_sent_at ? ` · 최근 ${fmtDate(m.last_sent_at, true)}` : ''}
                      </span>
                      <span style={{ marginLeft: 'auto' }} />
                      <button className="icon-btn" title="다시 보내기" disabled={busy} onClick={() => resend(m)}>
                        <IconRepeat size={15} stroke={1.75} />
                      </button>
                      <button className="icon-btn" title="수정" disabled={busy} onClick={() => resetComposer(bodyHtml(m.body), m)}>
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
