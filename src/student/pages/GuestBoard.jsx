import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IconArrowLeft, IconPlus, IconMessageCircle, IconMessages } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { Loading, EmptyState, EmojiBar, useToast } from '../../shared/ui'
import { fmtDate, isNew, insertAtCursor } from '../../lib/helpers'

/* 게스트 공개게시판 — 관리자가 발급한 QR(토큰 링크)로 접속.
   회원가입 없이 열람·글쓰기 가능. 글 작성 시 소속·작성자·제목·내용 필수.
   모든 접근은 토큰을 검증하는 security definer RPC를 통해서만 이뤄진다. */
export default function GuestBoard() {
  const [params] = useSearchParams()
  const token = params.get('key') || ''
  // QR 스캔 직후에는 바로 글쓰기 화면으로 진입한다
  const [view, setView] = useState('new') // 'list' | 'new' | { postId }
  const [posts, setPosts] = useState(null)
  const [invalid, setInvalid] = useState(!token)

  async function loadList() {
    const { data, error } = await supabase.rpc('guest_board_list', { p_token: token })
    if (error || !data?.ok) { setInvalid(true); return }
    setPosts(data.posts || [])
  }
  useEffect(() => { if (token) loadList() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (invalid) {
    return (
      <GuestShell>
        <EmptyState
          title="유효하지 않은 접속 링크입니다"
          description="QR코드를 다시 스캔하거나 관리자에게 새 링크를 요청해 주세요." />
      </GuestShell>
    )
  }

  return (
    <GuestShell>
      {view === 'list' && (
        posts === null ? <Loading /> : (
          <GuestPostList posts={posts} onWrite={() => setView('new')} onOpen={(id) => setView({ postId: id })} />
        )
      )}
      {view === 'new' && (
        <GuestPostNew token={token} onDone={(saved) => { setView('list'); if (saved) loadList() }} />
      )}
      {typeof view === 'object' && (
        <GuestPostDetail token={token} postId={view.postId} onBack={() => setView('list')} />
      )}
    </GuestShell>
  )
}

function GuestShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar" style={{ position: 'sticky', top: 0 }}>
        <span className="sidebar-logo">AX</span>
        <span className="topbar-title">AX오픈랩 LMS · 공개게시판</span>
      </header>
      <main className="content" style={{ width: '100%', maxWidth: 860, margin: '0 auto', padding: '32px 16px', flex: 1 }}>
        {children}
      </main>
    </div>
  )
}

function GuestPostList({ posts, onWrite, onOpen }) {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2 className="t-h2">공개게시판</h2>
          <p className="t-muted-sm">누구나 자유롭게 글을 남길 수 있는 공간입니다.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onWrite}>
          <IconPlus size={14} stroke={1.75} /> 글쓰기
        </button>
      </div>
      {posts.length === 0 ? (
        <EmptyState icon={IconMessages} title="아직 게시글이 없습니다" description="첫 번째 글을 남겨 보세요."
          action={<button className="btn btn-primary btn-sm" onClick={onWrite}>글쓰기</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>제목</th><th style={{ width: 130 }}>소속</th><th style={{ width: 120 }}>작성자</th><th style={{ width: 110 }}>작성일</th></tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
                  <td>
                    {p.title}
                    {p.comment_count > 0 && <span className="t-caption" style={{ color: 'var(--primary)', marginLeft: 6 }}>[{p.comment_count}]</span>}
                    {isNew(p.created_at) && <span className="badge-new" style={{ marginLeft: 6 }}>NEW</span>}
                  </td>
                  <td className="t-muted-sm">{p.author_org || '-'}</td>
                  <td className="t-muted-sm">{p.author_name}</td>
                  <td className="tnum">{fmtDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GuestPostNew({ token, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ org: '', author: '', title: '', body: '' })
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function pickEmoji(em) {
    const next = insertAtCursor(bodyRef.current, em, form.body, 5000)
    if (next != null) setForm((f) => ({ ...f, body: next }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.org.trim() || !form.author.trim() || !form.title.trim() || !form.body.trim()) {
      toast('소속, 작성자, 제목, 내용을 모두 입력해 주세요.', 'error')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('guest_board_create_post', {
      p_token: token, p_org: form.org.trim(), p_author: form.author.trim(),
      p_title: form.title.trim(), p_body: form.body.trim(),
    })
    setBusy(false)
    if (error || !data?.ok) {
      toast(data?.error === 'too_long' ? '입력 내용이 너무 깁니다.' : '등록에 실패했습니다.', 'error')
      return
    }
    toast('게시글이 등록되었습니다.')
    onDone(true)
  }

  return (
    <div className="card-panel" style={{ maxWidth: 720 }}>
      <h2 className="t-h2 mb-16">글쓰기</h2>
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field">
            <label>소속 <span className="req">*</span></label>
            <input className="input" maxLength={40} placeholder="예: OO회사 / OO대학교" value={form.org} onChange={set('org')} />
          </div>
          <div className="field">
            <label>작성자 <span className="req">*</span></label>
            <input className="input" maxLength={40} placeholder="이름 또는 닉네임" value={form.author} onChange={set('author')} />
          </div>
        </div>
        <div className="field">
          <label>제목 <span className="req">*</span></label>
          <input className="input" maxLength={120} value={form.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label>내용 <span className="req">*</span></label>
          <textarea ref={bodyRef} className="textarea" maxLength={5000} style={{ minHeight: 140 }} value={form.body} onChange={set('body')} />
          <EmojiBar onPick={pickEmoji} />
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-white" onClick={() => onDone(false)}>목록 보기</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? '등록 중…' : '등록'}</button>
        </div>
      </form>
    </div>
  )
}

function GuestPostDetail({ token, postId, onBack }) {
  const [data, setData] = useState(null) // null=로딩, false=없음, { post, comments }

  useEffect(() => {
    let alive = true
    supabase.rpc('guest_board_get', { p_token: token, p_post_id: postId }).then(({ data: d, error }) => {
      if (!alive) return
      setData(!error && d?.ok ? { post: d.post, comments: d.comments || [] } : false)
    })
    return () => { alive = false }
  }, [token, postId])

  if (data === null) return <Loading />
  if (data === false) return <EmptyState title="게시글을 찾을 수 없습니다" action={<button className="btn btn-white btn-sm" onClick={onBack}>목록으로</button>} />

  const { post, comments } = data
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>
      <div className="card-panel">
        <h2 className="t-h2 mb-8">{post.title}</h2>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(post.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{post.author_name}</span>
          {post.author_org && <span className="t-caption muted-soft">{post.author_org}</span>}
          <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(post.created_at, true)}</span>
        </div>
        <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{post.body}</p>
      </div>
      <div className="card-panel">
        <h3 className="t-h3 mb-16">
          <IconMessageCircle size={16} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          댓글 {comments.length}
        </h3>
        {comments.length === 0 && <p className="t-muted-sm">댓글이 없습니다.</p>}
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
          </div>
        ))}
        <p className="t-caption muted-soft mt-8">댓글 작성은 회원만 가능합니다.</p>
      </div>
    </div>
  )
}
