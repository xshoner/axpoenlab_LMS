import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconTrophy, IconFile, IconDownload, IconExternalLink } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { Loading, EmptyState, StarRating, useToast } from '../../shared/ui'
import { fmtDate, fmtBytes, downloadFile } from '../../lib/helpers'

/* 명예의 전당 — 기수별 해커톤 TOP3 자동 아카이브 (읽기 전용, 관리자만 삭제 가능) */
export default function HallOfFame() {
  return (
    <Routes>
      <Route index element={<HallList />} />
      <Route path=":id" element={<HallDetail />} />
    </Routes>
  )
}

const RANK_STYLE = {
  1: { emoji: '🥇', label: 'TOP 1', bg: '#FEF3C7', fg: '#92400E' },
  2: { emoji: '🥈', label: 'TOP 2', bg: '#F1F5F9', fg: '#475569' },
  3: { emoji: '🥉', label: 'TOP 3', bg: '#FEE8D6', fg: '#9A3412' },
}

export function RankBadge({ rank, avg }) {
  const s = RANK_STYLE[rank] || RANK_STYLE[3]
  return (
    <span className="pill" style={{ background: s.bg, color: s.fg, fontWeight: 700, gap: 4 }}>
      {s.emoji} {s.label}
      {avg != null && <span style={{ fontWeight: 500 }}>· ★ {Number(avg).toFixed(1)}</span>}
    </span>
  )
}

function HallList() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('hall_of_fame').select('*')
      .order('created_at', { ascending: false }).order('rank')
      .then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return <Loading />

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h2 className="t-h2 row" style={{ gap: 8 }}>
          <IconTrophy size={22} stroke={1.75} color="var(--accent-deep)" /> 명예의 전당
        </h2>
        <p className="t-muted-sm">각 기수 바이브 해커톤에서 가장 높은 평가를 받은 TOP 3 결과물의 기록입니다.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={IconTrophy} title="아직 등재된 기록이 없습니다"
          description="해커톤이 마감되면 상위 3개 결과물이 자동으로 이곳에 기록됩니다." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>웹앱 제목</th>
                <th style={{ width: 110 }}>기수</th>
                <th style={{ width: 150 }}>순위</th>
                <th style={{ width: 110 }}>날짜</th>
                <th style={{ width: 130 }}>소속</th>
                <th style={{ width: 110 }}>이름</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={r.id} style={{ textDecoration: 'none', color: 'var(--foreground)', fontWeight: r.rank === 1 ? 700 : 400 }}>
                      {r.title}
                    </Link>
                  </td>
                  <td className="t-muted-sm">{r.cohort_name || '-'}</td>
                  <td><RankBadge rank={r.rank} avg={r.avg_rating} /></td>
                  <td className="tnum">{fmtDate(r.created_at)}</td>
                  <td className="t-muted-sm">{r.author_org || '-'}</td>
                  <td className="t-muted-sm">{r.author_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HallDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [row, setRow] = useState(null)

  useEffect(() => {
    supabase.from('hall_of_fame').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => setRow(data || false))
  }, [id])

  if (row === null) return <Loading />
  if (row === false) return <EmptyState title="기록을 찾을 수 없습니다" action={<Link to="/hall-of-fame" className="btn btn-white btn-sm">목록으로</Link>} />

  const attachments = Array.isArray(row.attachments) ? row.attachments : []

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <button className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/hall-of-fame')}>
        <IconArrowLeft size={14} stroke={1.75} /> 목록으로
      </button>
      <div className="card-panel">
        <div className="row mb-8" style={{ gap: 8, flexWrap: 'wrap' }}>
          <RankBadge rank={row.rank} avg={row.avg_rating} />
          <span className="pill pill-neutral">{row.cohort_name}</span>
        </div>
        <h2 className="t-h2 mb-8">{row.title}</h2>
        <div className="row mb-16" style={{ gap: 8 }}>
          <span className="avatar">{(row.author_name || '?').slice(0, 1)}</span>
          <span className="t-label">{row.author_name}</span>
          {row.author_org && <span className="t-caption muted-soft">{row.author_org}</span>}
          <span className="t-caption muted-soft tnum" style={{ marginLeft: 'auto' }}>{fmtDate(row.created_at)} 등재</span>
        </div>
        <div className="row mb-16" style={{ gap: 8 }}>
          <StarRating value={row.avg_rating} size={18} showValue count={row.rating_count} />
          <span className="t-caption muted-soft">최종 평균 별점</span>
        </div>
        {row.url && (
          <a href={row.url} target="_blank" rel="noreferrer" className="btn btn-primary mb-16" style={{ alignSelf: 'flex-start' }}>
            <IconExternalLink size={16} stroke={1.75} /> 웹앱 열어 보기
          </a>
        )}
        {row.summary && <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{row.summary}</p>}
        {attachments.length > 0 && (
          <div className="mt-16">
            <h3 className="t-h3 mb-8">첨부파일</h3>
            {attachments.map((a, i) => (
              <div key={i} className="attachment-row">
                <IconFile size={18} stroke={1.75} color="var(--muted)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                <span className="size">{fmtBytes(a.file_size)}</span>
                <button className="icon-btn" aria-label={`${a.filename} 다운로드`}
                  onClick={() => downloadFile('hackathon-files', a.file_path, a.filename).catch(() => toast('파일을 찾을 수 없습니다.', 'error'))}>
                  <IconDownload size={16} stroke={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="t-caption muted-soft mt-16">명예의 전당 기록은 아카이브로 보존되며 수정할 수 없습니다.</p>
      </div>
    </div>
  )
}
