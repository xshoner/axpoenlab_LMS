import { useEffect, useState } from 'react'
import { IconArrowLeft, IconTrash, IconMessageCircle } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { ConfirmDialog, EmptyState, Loading, useToast } from '../../shared/ui'
import { fmtDate } from '../../lib/helpers'

/* 공개게시판 관리 — 게시글·댓글 열람, 부적절한 글 삭제, 댓글 작성 */
export default function BoardAdmin() {
  const { profile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [openId, setOpenId] = useState(null)
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
        if (openId === deleteTarget.row.id) setOpenId(null)
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
      author_name: profile.nickname || profile.name, body: reply.trim(),
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
        <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenId(null)}>
          <IconArrowLeft size={14} stroke={1.75} /> 목록으로
        </button>
        <div className="card-panel">
          <div className="row-between mb-8">
            <h2 className="t-h2">{current.title}</h2>
            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ kind: 'post', row: current })}>
              <IconTrash size={14} stroke={1.75} /> 게시글 삭제
            </button>
          </div>
          <div className="t-caption muted-soft tnum mb-16">{current.author_name} · {fmtDate(current.created_at, true)}</div>
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
      {rows.length === 0 ? (
        <EmptyState title="게시글이 없습니다" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th>작성자</th><th>댓글</th><th>작성일</th><th style={{ width: 60 }}></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                  <td className="t-emph">{r.title}</td>
                  <td className="t-muted-sm">{r.author_name}</td>
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
