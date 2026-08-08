import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  IconLayoutDashboard, IconUsersGroup, IconBook2, IconClipboardText, IconChecklist,
  IconPencilQuestion, IconSpeakerphone, IconUsers, IconMessageCircleQuestion,
  IconShieldLock, IconSettings, IconLogout, IconMenu2,
} from '@tabler/icons-react'
import { useAuth, signOut } from '../shared/auth'
import { Aurora, FooterBar, Loading, StatusPill, VisitorCounter } from '../shared/ui'
import { CohortProvider, useCohort } from './cohortContext'
import { COHORT_STATUS } from '../lib/helpers'
import AdminDashboard from './pages/AdminDashboard'
import Cohorts from './pages/Cohorts'
import CoursesAdmin from './pages/CoursesAdmin'
import AssignmentMatrix from './pages/AssignmentMatrix'
import SurveysAdmin from './pages/SurveysAdmin'
import QuizzesAdmin from './pages/QuizzesAdmin'
import NoticesAdmin from './pages/NoticesAdmin'
import Members from './pages/Members'
import InquiriesAdmin from './pages/InquiriesAdmin'
import AdminAccounts from './pages/AdminAccounts'
import SystemSettings from './pages/SystemSettings'

const MENU = [
  { to: '/', label: '대시보드', icon: IconLayoutDashboard, end: true },
  { to: '/cohorts', label: '기수 관리', icon: IconUsersGroup },
  { to: '/courses', label: '강좌 관리', icon: IconBook2 },
  { to: '/assignments', label: '과제 관리', icon: IconClipboardText },
  { to: '/surveys', label: '설문 관리', icon: IconChecklist },
  { to: '/quizzes', label: '퀴즈 관리', icon: IconPencilQuestion },
  { to: '/notices', label: '공지 관리', icon: IconSpeakerphone },
  { to: '/members', label: '회원 관리', icon: IconUsers },
  { to: '/inquiries', label: '문의 관리', icon: IconMessageCircleQuestion },
]

export default function AdminApp() {
  const { session, profile } = useAuth()

  if (session === undefined) return <Loading label="세션 확인 중…" />
  if (!session) {
    window.location.replace('/')
    return <Loading label="로그인 페이지로 이동 중…" />
  }
  if (profile && profile.role === 'student') {
    window.location.replace('/')
    return <Loading label="학습자 페이지로 이동 중…" />
  }
  if (!profile) return <Loading />

  return (
    <CohortProvider>
      <AdminShell profile={profile} />
    </CohortProvider>
  )
}

function AdminShell({ profile }) {
  const location = useLocation()
  const { cohorts, selectedId, select } = useCohort()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [unanswered, setUnanswered] = useState(0)
  const isSuper = profile.role === 'super_admin'

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open')
        .then(({ count }) => setUnanswered(count || 0))
    })
  }, [location.pathname])

  return (
    <>
      <Aurora mode="work" />
      <div className="shell">
        <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
          <div className="sidebar-brand">
            <span className="sidebar-logo">AX</span>
            <div>
              <div className="t-h3">AX오픈랩 LMS</div>
              <div className="t-micro muted-soft">관리자</div>
            </div>
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            {isSuper ? <span className="badge-role">슈퍼관리자</span> : <span className="badge-role-soft">관리자</span>}
          </div>
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} stroke={1.75} /> {label}
              {to === '/inquiries' && unanswered > 0 && <span className="count-pill">{unanswered}</span>}
            </NavLink>
          ))}
          {isSuper && (
            <>
              <div className="sidebar-section">시스템 총괄</div>
              <NavLink to="/admins" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <IconShieldLock size={18} stroke={1.75} /> 관리자 계정 관리
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <IconSettings size={18} stroke={1.75} /> 시스템 총괄 설정
              </NavLink>
            </>
          )}
          <div className="sidebar-footer">
            <button className="sidebar-item" onClick={signOut}>
              <IconLogout size={18} stroke={1.75} /> 로그아웃
            </button>
          </div>
        </aside>
        <div className={`drawer-overlay ${drawerOpen ? 'show' : ''}`} onClick={() => setDrawerOpen(false)} />
        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn hamburger" onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기">
              <IconMenu2 size={20} stroke={1.75} />
            </button>
            <select className="select-sm" value={selectedId} onChange={(e) => select(e.target.value)} aria-label="기수 선택">
              <option value="">전체 기수</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({COHORT_STATUS[c.status]})</option>
              ))}
            </select>
            {selectedId && <StatusPill kind="neutral">{cohorts.find((c) => c.id === selectedId)?.name} 기준으로 표시 중</StatusPill>}
            <div className="topbar-right">
              <VisitorCounter />
              <span className="avatar">{(profile.name || '?').slice(0, 1)}</span>
              <span className="t-label">{profile.name}</span>
            </div>
          </header>
          <main className="content wide" style={{ maxWidth: 1440 }}>
            <Routes>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/cohorts" element={<Cohorts />} />
              <Route path="/courses/*" element={<CoursesAdmin />} />
              <Route path="/assignments" element={<AssignmentMatrix />} />
              <Route path="/surveys/*" element={<SurveysAdmin />} />
              <Route path="/quizzes/*" element={<QuizzesAdmin />} />
              <Route path="/notices" element={<NoticesAdmin />} />
              <Route path="/members" element={<Members />} />
              <Route path="/inquiries" element={<InquiriesAdmin />} />
              {isSuper && <Route path="/admins" element={<AdminAccounts />} />}
              {isSuper && <Route path="/settings" element={<SystemSettings />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <FooterBar />
        </div>
      </div>
    </>
  )
}
