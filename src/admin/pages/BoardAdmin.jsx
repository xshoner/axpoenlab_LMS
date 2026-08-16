import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IconArrowLeft, IconTrash, IconMessageCircle, IconQrcode, IconCopy, IconRefresh } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { ConfirmDialog, EmptyState, Loading, useToast } from '../../shared/ui'
import { fmtDate } from '../../lib/helpers'

/* 공개게시판 관리 — 게시글·댓글 열람, 부적절한 글 삭제, 댓글 작성, 게스트 QR 발급 */
export default function BoardAdmin() {
  const { profile } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  // 대시보드 '공개게시판 최근 게시글'에서 ?post=<id>로 진입하면 해당 글을 바로 연다
  const [openId, setOpenId] = useState(searchParams.get('post') || null)

  function closePost() {
    setOpenId(null)
    if (searchParams.get('post')) setSearchParams({}, { replace: true })
  }
  const [comments, setComments] = useState([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { kind: 'post'|'comment', row }
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('board_posts')
      .select('*, board_comments(count)')
      .order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const p = searchParams.get('post')
    if (p) setOpenId(p)
  }, [searchParams])

  useEffect(() => {
    if (!openId) { setComments([]); return }
    supabase.from('board_comments').select('*').eq('post_id', openId).order('created_at')
      .then(({ data }) => setComments(data || []))
  }, [openId])

  if (!rows) return <Loading />

  const current = rows.find((r) => r.id === openId)

  async function doDelete() {
    setDeleteBusy(true)
    try {
      if (deleteTarget.kind === 'post') {
        const { error } = await supabase.from('board_posts').delete().eq('id', deleteTarget.row.id)
        if (error) throw error
        toast('게시글이 삭제되었습니다.')
        if (openId === deleteTarget.row.id) closePost()
        load()
      } else {
        const { error } = await supabase.from('board_comments').delete().eq('id', deleteTarget.row.id)
        if (error) throw error
        toast('댓글이 삭제되었습니다.')
        setComments((c) => c.filter((x) => x.id !== deleteTarget.row.id))
      }
      setDeleteTarget(null)
    } catch {
      toast('삭제에 실패했습니다.', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function addComment(e) {
    e.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    const { error } = await supabase.from('board_comments').insert({
      post_id: openId, user_id: profile.id,
      author_name: profile.nickname || profile.name,
      author_org: profile.org || '', body: reply.trim(),
    })
    setBusy(false)
    if (error) { toast('댓글 등록에 실패했습니다.', 'error'); return }
    setReply('')
    const { data } = await supabase.from('board_comments').select('*').eq('post_id', openId).order('created_at')
    setComments(data || [])
  }

  if (current) {
    return (
      <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
        <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={closePost}>
          <IconArrowLeft size={14} stroke={1.75} /> 목록으로
        </button>
        <div className="card-panel">
          <div className="row-between mb-8">
            <h2 className="t-h2">{current.title}</h2>
            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ kind: 'post', row: current })}>
              <IconTrash size={14} stroke={1.75} /> 게시글 삭제
            </button>
          </div>
          <div className="t-caption muted-soft tnum mb-16">
            {current.author_org && <>{current.author_org} · </>}
            {current.author_name}{current.is_guest && ' (게스트)'} · {fmtDate(current.created_at, true)}
          </div>
          <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{current.body}</p>
        </div>
        <div className="card-panel">
          <h3 className="t-h3 mb-16">
            <IconMessageCircle size={16} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            댓글 {comments.length}
          </h3>
          {comments.map((c) => (
            <div key={c.id} className="attachment-row" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="t-label">{c.author_name}</span>
                  {c.author_org && <span className="t-caption muted-soft">{c.author_org}</span>}
                  <span className="t-caption muted-soft tnum">{fmtDate(c.created_at, true)}</span>
                </div>
                <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>
              </div>
              <button className="icon-btn danger" title="댓글 삭제" onClick={() => setDeleteTarget({ kind: 'comment', row: c })}>
                <IconTrash size={14} stroke={1.75} />
              </button>
            </div>
          ))}
          <form onSubmit={addComment} className="row mt-16" style={{ gap: 8, alignItems: 'flex-start' }}>
            <textarea className="textarea" style={{ minHeight: 60, flex: 1 }} placeholder="운영진 댓글을 입력하세요"
              value={reply} onChange={(e) => setReply(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} style={{ marginTop: 4 }}>
              {busy ? '등록 중…' : '등록'}
            </button>
          </form>
        </div>
        <ConfirmDialog open={!!deleteTarget} danger busy={deleteBusy}
          title={deleteTarget?.kind === 'post' ? '게시글 삭제' : '댓글 삭제'}
          message={deleteTarget?.kind === 'post' ? `'${deleteTarget?.row?.title}' 게시글과 모든 댓글이 삭제됩니다.` : '댓글을 삭제할까요?'}
          confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2 className="t-h2">게시판 관리 <span className="t-muted-sm tnum">(전체 {rows.length}건)</span></h2>
      <GuestQrPanel />
      {rows.length === 0 ? (
        <EmptyState title="게시글이 없습니다" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>소속</th><th>작성자</th><th>댓글</th><th>작성일</th><th style={{ width: 60 }}></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                  <td className="t-emph">{r.title}</td>
                  <td className="t-muted-sm">{r.author_org || '-'}</td>
                  <td className="t-muted-sm">{r.author_name}{r.is_guest && <span className="t-caption muted-soft"> (게스트)</span>}</td>
                  <td className="tnum">{r.board_comments?.[0]?.count || 0}</td>
                  <td className="tnum">{fmtDate(r.created_at, true)}</td>
                  <td>
                    <button className="icon-btn danger" title="삭제"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'post', row: r }) }}>
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} danger busy={deleteBusy}
        title="게시글 삭제"
        message={`'${deleteTarget?.row?.title}' 게시글과 모든 댓글이 삭제됩니다.`}
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}

/* ============ 게스트 QR 접속 패널 ============
   회원가입 없이 QR 스캔만으로 공개게시판에 글을 쓸 수 있는 링크·QR을 발급한다.
   토큰은 system_settings('board_guest_token')에 저장되며 재발급 시 기존 QR은 무효화된다. */
function GuestQrPanel() {
  const toast = useToast()
  const [token, setToken] = useState(undefined) // undefined=로딩, null=미발급
  const [qr, setQr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'board_guest_token').maybeSingle()
      .then(({ data }) => setToken(data ? data.value : null))
  }, [])

  const url = token ? `${window.location.origin}/#/guest-board?key=${token}` : null

  useEffect(() => {
    if (!url) { setQr(null); return }
    let alive = true
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(url, { width: 220, margin: 1 }))
      .then((dataUrl) => { if (alive) setQr(dataUrl) })
      .catch(() => { if (alive) setQr(null) })
    return () => { alive = false }
  }, [url])

  async function rotate() {
    setBusy(true)
    const { data, error } = await supabase.rpc('rotate_board_guest_token')
    setBusy(false)
    setRotateOpen(false)
    if (error || !data) { toast('QR 발급에 실패했습니다.', 'error'); return }
    setToken(data)
    toast(token ? '새 QR이 발급되었습니다. 기존 QR은 더 이상 사용할 수 없습니다.' : 'QR이 발급되었습니다.')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      toast('접속 링크가 복사되었습니다.')
    } catch {
      toast('복사에 실패했습니다. 링크를 직접 선택해 주세요.', 'error')
    }
  }

  // QR을 고해상도로 새 창에 크게 표시 (현장 게시·스크린 공유용)
  async function openLargeQr() {
    try {
      const m = await import('qrcode')
      const bigQr = await (m.default || m).toDataURL(url, { width: 720, margin: 2 })
      const win = window.open('', '_blank', 'width=720,height=820')
      if (!win) { toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'error'); return }
      win.document.write(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>공개게시판 게스트 QR</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
         justify-content: center; gap: 16px; background: #fff; color: #222;
         font-family: Pretendard, -apple-system, 'Malgun Gothic', sans-serif; }
  h1 { font-size: 20px; margin: 0; }
  img { width: min(80vw, 80vh, 640px); height: auto; }
  p { font-size: 13px; color: #888; margin: 0; word-break: break-all; max-width: 90vw; text-align: center; }
  @media print { p.hint { display: none; } }
</style></head>
<body>
  <h1>AX오픈랩 LMS · 공개게시판 게스트 접속</h1>
  <img src="${bigQr}" alt="게스트 게시판 접속 QR" />
  <p>${url}</p>
  <p class="hint">이 창을 그대로 인쇄(Ctrl+P)하거나 화면에 띄워 사용하세요.</p>
</body></html>`)
      win.document.close()
    } catch {
      toast('QR 확대에 실패했습니다.', 'error')
    }
  }

  if (token === undefined) return null

  return (
    <div className="card-panel">
      <div className="row mb-8" style={{ gap: 8 }}>
        <IconQrcode size={18} stroke={1.75} color="var(--primary)" />
        <h3 className="t-h3">게스트 QR 접속</h3>
        <span className="t-caption muted-soft" style={{ marginLeft: 'auto' }}>
          QR을 스캔하면 회원가입 없이 공개게시판에 글을 쓸 수 있습니다
        </span>
      </div>
      {token === null ? (
        <div className="row" style={{ gap: 12 }}>
          <p className="t-muted-sm" style={{ flex: 1 }}>
            아직 발급된 QR이 없습니다. 발급하면 QR 이미지와 접속 링크가 표시됩니다.
          </p>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={rotate}>
            <IconQrcode size={14} stroke={1.75} /> {busy ? '발급 중…' : 'QR 발급'}
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {qr && (
            <button type="button" onClick={openLargeQr} title="클릭하면 새 창에서 크게 보기"
              style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in', textAlign: 'center' }}>
              <img src={qr} alt="게스트 게시판 접속 QR — 클릭하면 크게 보기" width={140} height={140}
                style={{ display: 'block', borderRadius: 8, border: '1px solid var(--border)' }} />
              <span className="t-caption muted-soft">클릭하면 크게 보기</span>
            </button>
          )}
          <div className="stack" style={{ gap: 8, flex: 1, minWidth: 240 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>접속 링크</label>
              <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
              <span className="hint">게스트는 이 링크에서 소속·작성자·제목·내용을 입력해 글을 남깁니다. 재발급하면 기존 QR·링크는 무효화됩니다.</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-white btn-sm" onClick={copyLink}>
                <IconCopy size={14} stroke={1.75} /> 링크 복사
              </button>
              <button className="btn btn-white btn-sm" disabled={busy} onClick={() => setRotateOpen(true)}>
                <IconRefresh size={14} stroke={1.75} /> QR 재발급
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={rotateOpen} danger busy={busy}
        title="QR 재발급"
        message="새 QR을 발급하면 기존에 배포한 QR과 링크는 즉시 사용할 수 없게 됩니다. 계속할까요?"
        confirmLabel="재발급" onConfirm={rotate} onClose={() => setRotateOpen(false)} />
    </div>
  )
}
