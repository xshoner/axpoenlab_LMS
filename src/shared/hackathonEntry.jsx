import { useEffect, useState } from 'react'
import {
  IconArrowLeft, IconTrash, IconPencil, IconFile, IconDownload, IconExternalLink,
  IconBrandGithub, IconFileDescription, IconSparkles, IconTerminal2, IconMessage2, IconSend,
} from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { StatusPill, StarRating, ConfirmDialog, Loading, useToast } from './ui'
import { UrlHealthBadge, UrlThumbnail } from './urlcheck'
import { fmtDate, fmtBytes, downloadFile } from '../lib/helpers'

/* 해커톤 결과물 리뷰 화면 — 학생·관리자 공용.
   본문 구획 표시, URL 연결 상태·미리보기, 별점 평가(본인 결과물 제외), 한줄평(본인 글만 삭제). */
export function HackathonEntryView({ entry, profile, isAdmin = false, onBack, onEdit, onDelete }) {
  const toast = useToast()
  const [stat, setStat] = useState(null)
  const [myRating, setMyRating] = useState(0)
  const [closed, setClosed] = useState(false)
  const [rateBusy, setRateBusy] = useState(false)
  const [comments, setComments] = useState(null)
  const [draft, setDraft] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [deleteComment, setDeleteComment] = useState(null)

  const mine = entry.user_id === profile.id
  const displayName = profile.nickname || profile.name

  async function loadStats() {
    const { data } = await supabase.from('hackathon_rating_stats')
      .select('avg_rating, rating_count').eq('entry_id', entry.id).maybeSingle()
    setStat(data || null)
  }
  async function loadComments() {
    const { data } = await supabase.from('hackathon_comments')
      .select('id, user_id, author_name, body, created_at').eq('entry_id', entry.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [rQ, roundQ] = await Promise.all([
        supabase.from('hackathon_ratings').select('rating').eq('entry_id', entry.id).eq('user_id', profile.id).maybeSingle(),
        supabase.from('hackathon_rounds').select('closed').eq('cohort_id', entry.cohort_id).maybeSingle(),
      ])
      if (!alive) return
      setMyRating(rQ.data?.rating || 0)
      setClosed(!!roundQ.data?.closed)
      loadStats()
      loadComments()
    })()
    return () => { alive = false }
  }, [entry.id, entry.cohort_id, profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function rate(n) {
    if (rateBusy) return
    setRateBusy(true)
    const prev = myRating
    setMyRating(n)
    const { data, error } = await supabase.rpc('rate_hackathon', { p_entry_id: entry.id, p_rating: n })
    setRateBusy(false)
    if (error || !data?.ok) {
      setMyRating(prev)
      toast(data?.error === 'closed' ? '해커톤이 마감되어 평가할 수 없습니다.' : '별점 저장에 실패했습니다.', 'error')
      if (data?.error === 'closed') setClosed(true)
      return
    }
    toast(prev ? '별점이 수정되었습니다.' : '별점이 등록되었습니다!')
    loadStats()
  }

  async function addComment() {
    const body = draft.trim()
    if (!body) return
    setCommentBusy(true)
    const { error } = await supabase.from('hackathon_comments')
      .insert({ entry_id: entry.id, user_id: profile.id, author_name: displayName, body })
    setCommentBusy(false)
    if (error) { toast('평가 의견 저장에 실패했습니다.', 'error'); return }
    setDraft('')
    loadComments()
  }

  async function doDeleteComment() {
    setCommentBusy(true)
    const { error } = await supabase.from('hackathon_comments').delete().eq('id', deleteComment.id)
    setCommentBusy(false)
    setDeleteComment(null)
    if (error) { toast('삭제에 실패했습니다.', 'error'); return }
    loadComments()
  }

  const avgBlock = stat && stat.rating_count > 0 ? (
    <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
      <StarRating value={stat.avg_rating} size={22} showValue count={stat.rating_count} />
    </div>
  ) : <p className="t-muted-sm">아직 받은 평가가 없습니다.</p>

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>

      <div className="card-panel">
        <div className="row-between mb-8">
          <h2 className="t-h2 row" style={{ gap: 8 }}>
            {entry.title}
            {closed && <StatusPill kind="closed">마감</StatusPill>}
          </h2>
          <div className="row" style={{ gap: 6 }}>
            {onEdit && (
              <button className="btn btn-white btn-sm" onClick={onEdit}>
                <IconPencil size={14} stroke={1.75} /> 수정
              </button>
            )}
            {onDelete && (
              <button className="btn btn-danger btn-sm" onClick={onDelete}>
                <IconTrash size={14} stroke={1.75} /> 삭제
              </button>
            )}
          </div>
        </div>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(entry.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{entry.author_name}</span>
          {entry.author_org && <span className="t-caption muted-soft">{entry.author_org}</span>}
          <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(entry.created_at, true)}</span>
        </div>

        <div className="hk-sections">
          <div className="hk-section">
            <div className="hk-section-head"><IconExternalLink size={15} stroke={1.75} /> 웹앱 URL</div>
            {entry.url ? (
              <>
                <div className="hk-url-row">
                  <a href={entry.url} target="_blank" rel="noreferrer" className="hk-url" title={entry.url}>{entry.url}</a>
                  <UrlHealthBadge url={entry.url} />
                  <a href={entry.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                    <IconExternalLink size={14} stroke={1.75} /> 열어 보기
                  </a>
                </div>
                <UrlThumbnail url={entry.url} />
              </>
            ) : <span className="t-muted-sm">등록된 URL이 없습니다 (첨부파일 제출)</span>}
          </div>

          <div className="hk-section">
            <div className="hk-section-head"><IconFileDescription size={15} stroke={1.75} /> 주요 내용 요약</div>
            {entry.summary
              ? <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{entry.summary}</p>
              : <span className="t-muted-sm">작성된 요약이 없습니다.</span>}
          </div>

          <div className="hk-grid-2">
            <div className="hk-section">
              <div className="hk-section-head"><IconSparkles size={15} stroke={1.75} /> 주로 사용한 AI</div>
              {entry.main_ai
                ? <span className="hk-ai-chip">{entry.main_ai}</span>
                : <span className="t-muted-sm">선택하지 않음</span>}
            </div>
            <div className="hk-section">
              <div className="hk-section-head"><IconBrandGithub size={15} stroke={1.75} /> Github Repo.</div>
              {entry.repo_url
                ? <a href={entry.repo_url} target="_blank" rel="noreferrer" className="hk-url" title={entry.repo_url}>{entry.repo_url}</a>
                : <span className="t-muted-sm">등록되지 않음</span>}
            </div>
          </div>

          <div className="hk-section">
            <div className="hk-section-head"><IconTerminal2 size={15} stroke={1.75} /> 입력한 프롬프트 내용</div>
            {entry.prompt_text
              ? <pre className="prompt-box">{entry.prompt_text}</pre>
              : <span className="t-muted-sm">등록된 프롬프트가 없습니다.</span>}
          </div>

          {(entry.hackathon_attachments || []).length > 0 && (
            <div className="hk-section">
              <div className="hk-section-head"><IconFile size={15} stroke={1.75} /> 첨부파일</div>
              {entry.hackathon_attachments.map((a) => (
                <div key={a.id} className="attachment-row">
                  <IconFile size={18} stroke={1.75} color="var(--muted)" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                  <span className="size">{fmtBytes(a.file_size)}</span>
                  <button className="icon-btn" aria-label={`${a.filename} 다운로드`}
                    onClick={() => downloadFile('hackathon-files', a.file_path, a.filename).catch(() => toast('다운로드에 실패했습니다.', 'error'))}>
                    <IconDownload size={16} stroke={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- 별점 평가 ---- */}
      <div className="card-panel" style={{ textAlign: 'center' }}>
        {mine ? (
          <>
            <h3 className="t-h3 mb-8">동료들의 평가</h3>
            {avgBlock}
          </>
        ) : closed ? (
          <>
            <h3 className="t-h3 mb-8">최종 평가</h3>
            {avgBlock}
            <p className="t-caption muted-soft mt-8">해커톤이 마감되어 별점 평가가 종료되었습니다.</p>
          </>
        ) : (
          <>
            <h3 className="t-h3 mb-8">{isAdmin ? '관리자 평가' : '이 결과물은 어떠셨나요?'}</h3>
            <p className="t-muted-sm mb-16">별점을 눌러 평가해 주세요. 언제든 수정할 수 있습니다.</p>
            <StarRating value={myRating} onChange={rate} size={32} />
            <div className="t-caption muted-soft mt-8">
              {myRating > 0 ? `내 평가: ${myRating}점` : '아직 평가하지 않았습니다'}
              {stat && stat.rating_count > 0 && (
                <> · 평균 {Number(stat.avg_rating).toFixed(1)}점 ({stat.rating_count}명 참여)</>
              )}
            </div>
          </>
        )}

        {/* ---- 한줄평 ---- */}
        <div className="hk-comments">
          <div className="hk-section-head" style={{ justifyContent: 'center' }}>
            <IconMessage2 size={15} stroke={1.75} /> 평가 의견 {comments && comments.length > 0 && <span className="tnum">({comments.length})</span>}
          </div>
          <div className="hk-comment-form">
            <input className="input" maxLength={300} placeholder={mine ? '내 결과물에 남길 메모나 소감을 적어 주세요' : '한 줄로 평가 의견을 남겨 주세요 (최대 300자)'}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment() }} />
            <button className="btn btn-primary btn-sm" disabled={commentBusy || !draft.trim()} onClick={addComment}>
              <IconSend size={14} stroke={1.75} /> 등록
            </button>
          </div>
          {comments === null ? <Loading label="의견 불러오는 중…" /> : comments.length === 0 ? (
            <p className="t-caption muted-soft" style={{ padding: '8px 0' }}>아직 평가 의견이 없습니다.</p>
          ) : (
            <div className="hk-comment-list">
              {comments.map((c) => (
                <div key={c.id} className="hk-comment">
                  <span className="hk-comment-author">{c.author_name || '익명'}</span>
                  <span className="hk-comment-body">{c.body}</span>
                  <span className="t-caption muted-soft tnum hk-comment-date">{fmtDate(c.created_at)}</span>
                  {c.user_id === profile.id && (
                    <button className="icon-btn danger" title="내 의견 삭제" onClick={() => setDeleteComment(c)}>
                      <IconTrash size={14} stroke={1.75} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button className="btn btn-white" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>

      <ConfirmDialog open={!!deleteComment} danger busy={commentBusy} title="평가 의견 삭제"
        message="내가 작성한 이 평가 의견을 삭제할까요?"
        confirmLabel="삭제" onConfirm={doDeleteComment} onClose={() => setDeleteComment(null)} />
    </div>
  )
}
