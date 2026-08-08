import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconPin } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { Loading, EmptyState } from '../../shared/ui'
import { fmtDate, isNew } from '../../lib/helpers'

export default function Notices() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('notices')
      .select('id, title, created_at, view_count, pinned')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return <Loading />
  if (rows.length === 0) return <EmptyState title="등록된 공지가 없습니다" />

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th style={{ width: 60 }}>번호</th><th>제목</th><th style={{ width: 120 }}>등록일</th><th style={{ width: 80 }}>조회수</th></tr>
        </thead>
        <tbody>
          {rows.map((n, i) => (
            <tr key={n.id}>
              <td className="tnum">{n.pinned ? <IconPin size={16} stroke={1.75} color="var(--primary)" /> : rows.length - i}</td>
              <td>
                <Link to={`/notices/${n.id}`} style={{ textDecoration: 'none', color: 'var(--foreground)', fontWeight: n.pinned ? 600 : 400 }}>
                  {n.title}
                </Link>
                {isNew(n.created_at) && <span className="badge-new" style={{ marginLeft: 8 }}>NEW</span>}
              </td>
              <td className="tnum">{fmtDate(n.created_at)}</td>
              <td className="tnum">{n.view_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
