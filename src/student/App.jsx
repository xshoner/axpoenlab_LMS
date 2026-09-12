import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  IconLayoutDashboard, IconBook2, IconClipboardText, IconSpeakerphone,
  IconMessageCircleQuestion, IconMessages, IconUserCircle, IconLogout, IconMenu2,
  IconRocket, IconTrophy,
} from '@tabler/icons-react'
import { InactiveAccount, useAuth, signOut } from '../shared/auth'
import { Aurora, FooterBar, Loading, StatusPill, VisitorCounter } from '../shared/ui'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Reset from './pages/Reset'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import CourseDetail from './pages/CourseDetail'
import Assignments from './pages/Assignments'
import SurveyForm from './pages/SurveyForm'
import QuizPage from './pages/QuizPage'
import Notices from './pages/Notices'
import NoticeDetail from './pages/NoticeDetail'
import Inquiries from './pages/Inquiries'
import Board from './pages/Board'
import GuestBoard from './pages/GuestBoard'
import Hackathon from './pages/Hackathon'
import HallOfFame from './pages/HallOfFame'
import Profile from './pages/Profile'
import { useStudentPresenceTrack } from '../shared/presence'
import { StudentPushInbox } from '../shared/push'
import { StudentHelpButton } from '../shared/help'

const MENU = [
  { to: '/', label: '대시보드', icon: IconLayoutDashboard, end: true },
  { to: '/notices', label: '공지사항', icon: IconSpeakerphone },
  { to: '/courses', label: '내 교육과정', icon: IconBook2 },
  { to: '/assignments', label: '과제 제출', icon: IconClipboardText },
  { to: '/hackathon', label: '바이브 해커톤', icon: IconRocket },
  { to: '/hall-of-fame', label: '명예의 전당', icon: IconTrophy },
  { to: '/inquiries', label: '1:1 문의하기', icon: IconMessageCircleQuestion },
  { to: '/board', label: '공개게시판', icon: IconMessages },
]

const PAGE_TITLES = [
  ['/courses', '내 교육과정'],
  ['/assignments', '과제 제출'],
  ['/hackathon', '바이브 해커톤'],
  ['/notices', '공지사항'],
  ['/inquiries', '1:1 문의하기'],
  ['/board', '공개게시판'],
  ['/hall-of-fame', '명예의 전당'],
  ['/profile', '내 정보'],
  ['/surveys', '설문 응답'],
  ['/quizzes', '퀴즈'],
  ['/', '대시보드'],
]

export default function App() {
  const { session, profile, cohort } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAuthRoute = ['/login', '/signup', '/reset'].includes(location.pathname)
  const focusMode = /^\/(surveys|quizzes)\//.test(location.pathname)

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])
  const online = useStudentPresenceTrack(session && profile?.role === 'student' ? profile.id : null, cohort?.id || null)

  // QR 게스트 게시판 — 로그인 없이 접근 (토큰은 RPC에서 검증)
  if (location.pathname === '/guest-board') {
    return (
      <>
        <Aurora mode="work" />
        <GuestBoard />
      </>
    )
  }

  if (session === undefined) return <Loading label="세션 확인 중…" />

  // 비밀번호 재설정 메일로 진입한 복구 세션 — 변경 완료 전까지 재설정 화면만 노출
  if (session && sessionStorage.getItem('ax-recovery') === '1') {
    return (
      <>
        <Aurora mode="auth" />
        <Routes>
          <Route path="*" element={<Reset />} />
        </Routes>
      </>
    )
  }

  if (!session) {
    if (!isAuthRoute) return <Navigate to="/login" replace />
    return (
      <>
        <Aurora mode="auth" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset" element={<Reset />} />
        </Routes>
      </>
    )
  }

  // 관리자는 admin.html 로 이동
  if (!profile) return <Loading />
  if (profile.status !== 'active') return <InactiveAccount />

  if (profile.role !== 'student') {
    window.location.replace('/admin.html')
    return <Loading label="관리자 페이지로 이동 중…" />
  }

  if (isAuthRoute) return <Navigate to="/" replace />
  const title = PAGE_TITLES.find(([p]) => location.pathname.startsWith(p) && (p !== '/' || location.pathname === '/'))?.[1] || ''

  if (focusMode) {
    // 집중 모드: 오로라 없음, 단색 배경, 중앙 720px
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, width: '100%', maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
          <Routes>
            <Route path="/surveys/:id" element={<SurveyForm />} />
            <Route path="/quizzes/:id" element={<QuizPage />} />
          </Routes>
        </div>
        <FooterBar />
      </div>
    )
  }

  return (
    <>
      <Aurora mode="work" />
      <div className="shell">
        <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
          <div className="sidebar-brand">
            <span className="sidebar-logo">AX</span>
            <span className="t-h3">AX오픈랩 LMS</span>
          </div>
          {cohort ? (
            <div style={{ padding: '0 12px 12px' }}>
              <StatusPill kind="neutral">{cohort.name}</StatusPill>
            </div>
          ) : (
            <div style={{ padding: '0 12px 12px' }}>
              <StatusPill kind="open">기수 미배정</StatusPill>
            </div>
          )}
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} stroke={1.75} /> {label}
            </NavLink>
          ))}
          <div className="sidebar-footer">
            <NavLink to="/profile" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <IconUserCircle size={18} stroke={1.75} /> 내 정보
            </NavLink>
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
            <span className="topbar-title">{title}</span>
            <div className="topbar-right">
              <StudentHelpButton cohortId={cohort?.id || null} />
              <StudentPushInbox cohortId={cohort?.id || null} />
              <span className="live-pill" title="현재 접속 중인 학생 수">
                <span className="live-dot" />
                <span className="tnum">접속 {online}명</span>
              </span>
              <VisitorCounter />
              <Link to="/profile" className="profile-link" title="내 정보로 이동">
                <span className="avatar">{(profile.name || '?').slice(0, 1)}</span>
                <span className="t-label" style={{ color: 'var(--foreground)' }}>{profile.name}</span>
              </Link>
            </div>
          </header>
          <main className="content" style={{ maxWidth: 1440 }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/:id" element={<CourseDetail />} />
              <Route path="/assignments" element={<Assignments />} />
              <Route path="/notices" element={<Notices />} />
              <Route path="/notices/:id" element={<NoticeDetail />} />
              <Route path="/inquiries/*" element={<Inquiries />} />
              <Route path="/board/*" element={<Board />} />
              <Route path="/hackathon/*" element={<Hackathon />} />
              <Route path="/hall-of-fame/*" element={<HallOfFame />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <FooterBar />
        </div>
      </div>
    </>
  )
}
