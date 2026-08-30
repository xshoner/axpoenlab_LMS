import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconPlus, IconTrash, IconMessageCircle } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../shared/auth'
import { Loading, EmptyState, ConfirmDialog, EmojiBar, Pagination, useToast } from '../../shared/ui'
import { fmtDate, isNew, insertAtCursor } from '../../lib/helpers'
import { useDraft, DraftBadge } from '../../shared/draft'

/* 공개게시판 — 누구나 글·댓글 작성 가능, 본인 글은 삭제 가능 */
export default function Board() {
  return (
    <Routes>
      <Route index element={<PostList />} />
      <Route path="new" element={<PostNew />} />
      <Route path=":id" element={<PostDetail />} />
    </Routes>
  )
}

const PAGE_SIZE = 20

function PostList() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    supabase.from('board_posts')
      .select('id, title, author_name, author_org, is_guest, created_at, board_comments(count)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return <Loading />

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="stack">
      <div className="row-between">
        <h2 className="t-h2">공개게시판</h2>
        <Link to="new" className="btn btn-primary btn-sm"><IconPlus size={14} stroke={1.75} /> 글쓰기</Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="아직 게시글이 없습니다" description="첫 번째 글을 남겨 보세요."
          action={<Link to="new" className="btn btn-primary btn-sm">글쓰기</Link>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th style={{ width: '44%' }}>제목</th><th style={{ width: '20%' }}>소속</th><th style={{ width: '20%' }}>작성자</th><th style={{ width: '16%' }}>작성일</th></tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const commentCount = r.board_comments?.[0]?.count || 0
                return (
                  <tr key={r.id}>
                    <td className="t-emph">
                      <Link to={r.id} style={{ textDecoration: 'none', color: 'var(--foreground)' }}>
                        {r.title}
                        {commentCount > 0 && <span className="t-caption" style={{ color: 'var(--primary)', marginLeft: 6 }}>[{commentCount}]</span>}
                        {isNew(r.created_at) && <span className="badge-new" style={{ marginLeft: 6 }}>NEW</span>}
                      </Link>
                    </td>
                    <td className="t-muted-sm">{r.author_org || '-'}</td>
                    <td className="t-muted-sm">{r.author_name}</td>
                    <td className="tnum">{fmtDate(r.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

function PostNew() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const draft = useDraft(`board:${profile.id}:new`, { title, body },
    (d) => { setTitle(d.title || ''); setBody(d.body || '') }, (d) => !d.title && !d.body)

  function pickEmoji(em) {
    const next = insertAtCursor(bodyRef.current, em, body)
    if (next != null) setBody(next)
  }

  async function submit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { toast('제목과 내용을 입력해 주세요.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('board_posts').insert({
      user_id: profile.id, author_name: profile.nickname || profile.name,
      author_org: profile.org || '', title: title.trim(), body: body.trim(),
    })
    setBusy(false)
    if (error) { toast('등록에 실패했습니다.', 'error'); return }
    draft.clear()
    toast('게시글이 등록되었습니다.')
    nav('/board')
  }

  return (
    <div className="card-panel" style={{ maxWidth: 720 }}>
      <h2 className="t-h2 mb-16 row" style={{ gap: 10 }}>글쓰기 <DraftBadge savedAt={draft.savedAt} restored={draft.restored} /></h2>
      <form onSubmit={submit}>
        <div className="field">
          <label>제목 <span className="req">*</span></label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>내용 <span className="req">*</span></label>
          <textarea ref={bodyRef} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
          <EmojiBar onPick={pickEmoji} />
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-white" onClick={() => nav('/board')}>취소</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? '등록 중…' : '등록'}</button>
        </div>
      </form>
    </div>
  )
}

function PostDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // 'post' | comment row
  const [deleteBusy, setDeleteBusy] = useState(false)
  const commentRef = useRef(null)

  function pickEmoji(em) {
    const next = insertAtCursor(commentRef.current, em, comment)
    if (next != null) setComment(next)
  }

  async function load() {
    const [pQ, cQ] = await Promise.all([
      supabase.from('board_posts').select('*').eq('id', id).single(),
      supabase.from('board_comments').select('*').eq('post_id', id).order('created_at'),
    ])
    setPost(pQ.data || false)
    setComments(cQ.data || [])
  }
  useEffect(() => { load() }, [id])

  if (post === null) return <Loading />
  if (post === false) return <EmptyState title="게시글을 찾을 수 없습니다" />

  async function addComment(e) {
    e.preventDefault()
    if (!comment.trim()) return
    setBusy(true)
    const { error } = await supabase.from('board_comments').insert({
      post_id: id, user_id: profile.id,
      author_name: profile.nickname || profile.name,
      author_org: profile.org || '', body: comment.trim(),
    })
    setBusy(false)
    if (error) { toast('댓글 등록에 실패했습니다.', 'error'); return }
    setComment('')
    load()
  }

  async function doDelete() {
    setDeleteBusy(true)
    try {
      if (deleteTarget === 'post') {
        const { error } = await supabase.from('board_posts').delete().eq('id', id)
        if (error) throw error
        toast('게시글이 삭제되었습니다.')
        nav('/board')
      } else {
        const { error } = await supabase.from('board_comments').delete().eq('id', deleteTarget.id)
        if (error) throw error
        toast('댓글이 삭제되었습니다.')
        setDeleteTarget(null)
        load()
      }
    } catch {
      toast('삭제에 실패했습니다.', 'error')
      setDeleteTarget(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/board')}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>
      <div className="card-panel">
        <div className="row-between mb-8">
          <h2 className="t-h2">{post.title}</h2>
          {post.user_id === profile.id && (
            <button className="icon-btn danger" title="삭제" onClick={() => setDeleteTarget('post')}>
              <IconTrash size={16} stroke={1.75} />
            </button>
          )}
        </div>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(post.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{post.author_name}</span>
          {post.author_org && <span className="t-caption muted-soft">{post.author_org}</span>}
          {post.is_guest && <span className="pill pill-neutral">게스트</span>}
          <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(post.created_at, true)}</span>
        </div>
        <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{post.body}</p>
      </div>

      <div className="card-panel">
        <h3 className="t-h3 mb-16">
          <IconMessageCircle size={16} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          댓글 {comments.length}
        </h3>
        {comments.map((c) => (
          <div key={c.id} className="attachment-row" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
            <span className="avatar">{(c.author_name || '?').slice(0, 1)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="t-label">{c.author_name}</span>
                {c.author_org && <span className="t-caption muted-soft">{c.author_org}</span>}
                <span className="t-caption muted-soft tnum">{fmtDate(c.created_at, true)}</span>
              </div>
              <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>
            </div>
            {c.user_id === profile.id && (
              <button className="icon-btn danger" title="댓글 삭제" onClick={() => setDeleteTarget(c)}>
                <IconTrash size={14} stroke={1.75} />
              </button>
            )}
          </div>
        ))}
        <form onSubmit={addComment} className="mt-16">
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <textarea ref={commentRef} className="textarea" style={{ minHeight: 60, flex: 1 }} placeholder="댓글을 입력하세요"
              value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()} style={{ marginTop: 4 }}>
              {busy ? '등록 중…' : '등록'}
            </button>
          </div>
          <EmojiBar onPick={pickEmoji} size={18} />
        </form>
      </div>

      <ConfirmDialog open={!!deleteTarget} danger busy={deleteBusy}
        title={deleteTarget === 'post' ? '게시글 삭제' : '댓글 삭제'}
        message={deleteTarget === 'post' ? '게시글과 댓글이 모두 삭제됩니다. 계속할까요?' : '댓글을 삭제할까요?'}
        confirmLabel="삭제" onConfirm={doDelete} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
