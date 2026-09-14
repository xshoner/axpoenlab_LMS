import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconDeviceGamepad2, IconArrowLeft, IconPlus } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, Loading, useToast } from './ui'
import './arcade.css'

export default function Arcade() {
  const { profile } = useAuth()
  const admin = ['admin', 'super_admin'].includes(profile?.role)
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ url: '', name: '', description: '' })
  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const { data, error } = await supabase.from('arcade_games').select('*').order('created_at').order('id')
        if (error) throw error
        if (alive) setGames(data || [])
      } catch { if (alive) setError(true) }
      finally { if (alive) setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [retry])
  async function save(e) {
    e.preventDefault()
    if (busy) return
    let url
    try {
      url = new URL(form.url.trim())
      if (url.protocol !== 'https:' || url.username || url.password || url.origin === window.location.origin) throw new Error()
    } catch { toast('외부 웹 게임의 올바른 HTTPS URL을 입력해 주세요.', 'error'); return }
    const values = { url: url.href, name: form.name.trim(), description: form.description.trim() }
    if (!values.name || !values.description) { toast('게임이름과 게임설명을 입력해 주세요.', 'error'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.from('arcade_games').insert(values).select().single()
      if (error) throw error
      setGames(prev => [...prev, data])
      setOpen(false)
      setForm({ url: '', name: '', description: '' })
      toast('게임을 추가했습니다.')
      navigate(`/arcade/${data.id}`)
    } catch { toast('게임을 저장하지 못했습니다. 다시 시도해 주세요.', 'error') }
    finally { setBusy(false) }
  }
  if (loading) return <Loading />
  if (error) return <div role="alert">오락실을 불러오지 못했습니다. <button className="btn btn-white" onClick={() => setRetry(retry + 1)}>다시 시도</button></div>
  const game = games.find(g => g.id === id)
  if (id) return <section className="arcade">
    <Link to="/arcade" className="btn btn-white btn-sm"><IconArrowLeft size={16} /> 게임 목록</Link>
    {game ? <>
      <div className="arcade-player-heading"><h1 className="t-h2">{game.name}</h1><p className="muted">{game.description}</p></div>
      <div className="arcade-player"><iframe key={game.id} src={game.url} title={`${game.name} 게임 화면`} sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay; gamepad" referrerPolicy="no-referrer" /></div>
      <p className="t-muted-sm mt-8">게임 화면을 눌러 시작하세요. 방향키·터치 조작은 게임 안내를 따라 주세요.</p>
      <details className="t-muted-sm mt-8"><summary>게임 화면이 보이지 않나요?</summary>게임 제공 사이트가 프레임 실행을 허용해야 합니다. 관리자에게 URL 확인을 요청해 주세요.</details>
    </> : <p className="mt-16">게임을 찾을 수 없습니다.</p>}
  </section>
  return <section className="arcade">
    <div className="arcade-heading"><div><h1 className="t-h2">오락실</h1><p className="muted mt-8">잠깐 쉬어 가는 시간, 마음에 드는 게임을 골라 보세요.</p></div>
      {admin && <button className="btn btn-primary" onClick={() => setOpen(true)}><IconPlus size={18} /> 추가하기</button>}
    </div>
    <div className="arcade-list">{games.map((g, index) => <article className="arcade-card" key={g.id}>
      <Link to={`/arcade/${g.id}`} className={`arcade-thumbnail arcade-tone-${index % 3}`} aria-label={`${g.name} 실행`}>
        <IconDeviceGamepad2 size={62} stroke={1.4} /><span>{g.name}</span><span className="arcade-play">PLAY →</span>
        <img src={g.url.startsWith('https://jellyrungo.vercel.app/') ? '/arcade-jellyrun.png' : `https://s.wordpress.com/mshots/v1/${encodeURIComponent(g.url)}?w=600&h=375`} alt="" loading="lazy" onError={e => { e.currentTarget.hidden = true }} />
      </Link>
      <div className="arcade-card-body"><span className="t-micro muted">WEB GAME · {String(index + 1).padStart(2, '0')}</span><h2 className="t-h3"><Link to={`/arcade/${g.id}`}>{g.name}</Link></h2><p className="muted">{g.description}</p><Link className="arcade-start" to={`/arcade/${g.id}`}>게임 시작 →</Link></div>
    </article>)}</div>
    {!games.length && <p>아직 등록된 게임이 없습니다.</p>}
    <Dialog open={open} title="오락실 게임 추가" onClose={() => { if (!busy) setOpen(false) }}>
      <form onSubmit={save}>
        <div className="field"><label htmlFor="arcade-url">URL</label><input id="arcade-url" className="input" type="url" required maxLength={2048} placeholder="https://example.com/game" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></div>
        <div className="field"><label htmlFor="arcade-name">게임이름</label><input id="arcade-name" className="input" required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="arcade-description">게임설명</label><textarea id="arcade-description" className="input" required rows={4} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <p className="t-muted-sm">프레임 실행을 허용하는 HTTPS 웹 게임을 등록해 주세요.</p>
        <div className="dialog-actions"><button type="button" className="btn btn-white" disabled={busy} onClick={() => setOpen(false)}>취소</button><button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '확정'}</button></div>
      </form>
    </Dialog>
  </section>
}
