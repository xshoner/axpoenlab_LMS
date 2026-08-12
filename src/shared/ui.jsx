import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { IconCheck, IconAlertTriangle, IconInbox, IconX, IconStar, IconStarFilled } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { getSettings } from '../lib/helpers'

/* ---------- Toast ---------- */
const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-region">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.type === 'ok' ? (
              <IconCheck size={16} color="var(--success-wash)" stroke={1.75} />
            ) : (
              <IconAlertTriangle size={16} color="var(--danger-wash)" stroke={1.75} />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/* ---------- Dialog ---------- */
export function Dialog({ open, title, danger, children, onClose, actions }) {
  if (!open) return null
  return (
    <div className="dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="row mb-16" style={{ gap: 8 }}>
          {danger && <IconAlertTriangle size={20} color="var(--danger)" stroke={1.75} />}
          <h2 className="t-h2">{title}</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="닫기">
            <IconX size={18} stroke={1.75} />
          </button>
        </div>
        <div className="t-body muted">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, danger, confirmLabel = '확인', onConfirm, onClose, busy }) {
  return (
    <Dialog
      open={open}
      title={title}
      danger={danger}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-white btn-sm" onClick={onClose} disabled={busy}>취소</button>
          <button
            className={`btn btn-sm ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Dialog>
  )
}

/* ---------- Empty / Loading ---------- */
export function EmptyState({ icon, title, description, action }) {
  const Icon = icon || IconInbox
  return (
    <div className="empty-state">
      <Icon size={32} color="var(--border)" stroke={1.75} />
      <div className="t-h3" style={{ color: 'var(--foreground)' }}>{title}</div>
      {description && <div className="t-muted-sm">{description}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}

export function Loading({ label = '불러오는 중…' }) {
  return (
    <div className="page-loading">
      <span className="spinner" /> {label}
    </div>
  )
}

/* ---------- Status pill ---------- */
export function StatusPill({ kind = 'neutral', children }) {
  return (
    <span className={`pill pill-${kind}`}>
      <span className="dot" />
      {children}
    </span>
  )
}

/* ---------- Visitor counter ---------- */
export function VisitorCounter() {
  const [stats, setStats] = useState(null)
  const [show, setShow] = useState(true)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const settings = await getSettings()
        if (!alive) return
        setShow(settings.showVisitorCounter)
        const key = 'ax-visit-' + new Date().toISOString().slice(0, 10)
        if (!sessionStorage.getItem(key)) {
          const { data } = await supabase.rpc('record_visit')
          sessionStorage.setItem(key, '1')
          if (alive && data) setStats(data)
        } else {
          const { data } = await supabase.rpc('visit_stats')
          if (alive && data) setStats(data)
        }
      } catch { /* counter is non-critical */ }
    })()
    return () => { alive = false }
  }, [])
  if (!show || !stats) return null
  return (
    <span className="visitor-counter" title="오늘 방문자 · 누적 방문자">
      <UsersIcon />
      <span className="vc-full">오늘 {Number(stats.today).toLocaleString()}</span>
      <span className="vsep" />
      <span>누적 {Number(stats.total).toLocaleString()}</span>
    </span>
  )
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
    </svg>
  )
}

/* ---------- Footer ---------- */
export function FooterBar() {
  return (
    <footer className="footer-bar">
      <span>Produced by AXopenLab /</span>
      <a href="mailto:xshoner@gmail.com">xshoner@gmail.com</a>
    </footer>
  )
}

/* ---------- Aurora ---------- */
export function Aurora({ mode = 'work' }) {
  const auth = mode === 'auth'
  const alpha = auth ? [0.6, 0.55, 0.5] : [0.3, 0.26, 0.24]
  return (
    <div className={`aurora-layer ${auth ? 'aurora-auth' : ''}`} aria-hidden="true">
      <div className="aurora-blob aurora-blue" style={{ width: 480, height: 480, top: -180, left: -160, opacity: alpha[0] }} />
      <div className="aurora-blob aurora-gold" style={{ width: 420, height: 420, bottom: -160, right: -140, opacity: alpha[1] }} />
      {auth && (
        <div className="aurora-blob aurora-violet" style={{ width: 360, height: 360, top: '40%', right: -180, opacity: alpha[2] }} />
      )}
    </div>
  )
}

/* ---------- Simple horizontal bar (문항 통계) ---------- */
export function HBar({ label, count, total, color = 'var(--chart-1)', suffix }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="hbar-row">
      <div className="hbar-label" title={label}>{label}</div>
      <div className="hbar-track">
        <div className="hbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="hbar-value">{count}명 · {pct}%{suffix || ''}</div>
    </div>
  )
}

/* ---------- Donut (응답률) ---------- */
export function Donut({ value, total, label }) {
  const pct = total > 0 ? value / total : 0
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface)" strokeWidth="14" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke="var(--chart-1)" strokeWidth="14"
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform="rotate(-90 70 70)"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="t-stat">{Math.round(pct * 100)}%</span>
        <span className="t-caption muted-soft">{value} / {total}명{label ? ` ${label}` : ''}</span>
      </div>
    </div>
  )
}

/* ---------- Star rating (만족도) ---------- */
export function StarRating({ value = 0, onChange, size = 18, showValue = false, count }) {
  const editable = !!onChange
  const rounded = Math.round(Number(value) || 0)
  return (
    <span className={`star-rating ${editable ? 'editable' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button"
          className={`star-btn ${n <= rounded ? 'filled' : ''}`}
          disabled={!editable}
          onClick={editable ? () => onChange(n) : undefined}
          aria-label={`${n}점`}
          tabIndex={editable ? 0 : -1}
        >
          {n <= rounded ? <IconStarFilled size={size} /> : <IconStar size={size} stroke={1.75} />}
        </button>
      ))}
      {showValue && (
        <span className="star-value" style={{ marginLeft: 4 }}>
          {Number(value).toFixed(1)}
          {count != null && <span className="muted-soft t-caption"> ({count})</span>}
        </span>
      )}
    </span>
  )
}

/* ---------- 이모지 팔레트 (텍스트 입력 보조) ---------- */
const EMOJIS = ['😀', '😊', '😂', '🥰', '👍', '👏', '🙏', '🎉', '❤️', '🔥', '💡', '✨', '✅', '🤔', '💪', '🚀']

export function EmojiBar({ onPick, size = 20 }) {
  return (
    <div className="row" style={{ gap: 2, flexWrap: 'wrap', marginTop: 6 }} aria-label="이모지 삽입">
      {EMOJIS.map((em) => (
        <button key={em} type="button" title={`${em} 삽입`}
          onClick={() => onPick(em)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: size, lineHeight: 1, padding: '4px 5px', borderRadius: 6 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
          {em}
        </button>
      ))}
    </div>
  )
}

/* ---------- KPI stat card ---------- */
export function StatCard({ label, value, caption, large }) {
  return (
    <div className="card-stat">
      <div className="t-caption muted-soft">{label}</div>
      <div className={large ? 't-stat-lg' : 't-stat'} style={{ color: 'var(--primary)' }}>{value}</div>
      {caption && <div className="t-micro muted-soft">{caption}</div>}
    </div>
  )
}
