import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { Dialog, Loading } from './ui'

export default function TodayVisits({ onClose }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    async function load() {
      setError(false)
      setBusy(true)
      try {
        const { data, error } = await supabase.rpc('today_account_visits')
        if (error) throw error
        if (alive) setRows(data || [])
      } catch { if (alive) setError(true) }
      finally { if (alive) setBusy(false) }
    }
    load()
    const timer = setInterval(load, 60000)
    const escape = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('keydown', escape) }
  }, [retry, onClose])
  return createPortal(<Dialog open title="오늘 접속한 계정" onClose={onClose}>
    <p className="t-muted-sm mb-16">한국 시간 기준 · 전체 기수 · 계정별 마지막 접속만 표시 · 게스트 제외</p>
    {busy ? <Loading /> : error ? <div role="alert">접속 기록을 불러오지 못했습니다. <button className="btn btn-white btn-sm" onClick={() => setRetry(retry + 1)}>다시 시도</button></div>
      : rows.length === 0 ? <p>오늘 접속한 계정이 없습니다.</p> : <>
        <p className="mb-16">총 {rows.length}개 계정</p>
        <div className="today-visits-table"><table><thead><tr><th>ID (이메일)</th><th>소속</th><th>이름</th><th>시간</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><td>{row.email}</td><td>{row.org || '—'}</td><td>{row.name || '—'}</td><td className="tnum">{new Date(row.last_login_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false })}</td></tr>)}</tbody>
        </table></div>
      </>}
  </Dialog>, document.body)
}
