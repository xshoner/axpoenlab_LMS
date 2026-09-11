import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  IconLayoutDashboard, IconUsersGroup, IconBook2, IconClipboardText, IconChecklist,
  IconPencilQuestion, IconSpeakerphone, IconUsers, IconMessageCircleQuestion,
  IconShieldLock, IconSettings, IconLogout, IconMenu2, IconMessages, IconRocket, IconEye, IconHandStop,
} from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { InactiveAccount, useAuth, signOut } from '../shared/auth'
import { Aurora, Dialog, FooterBar, Loading, StatusPill, VisitorCounter, useToast } from '../shared/ui'
import { CohortProvider, useCohort } from './cohortContext'
import { useOnlineStudentCount, useOpenInquiryCount } from '../shared/presence'
import { AdminPushComposer } from '../shared/push'
import { useHelpQueueCount } from '../shared/help'
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
import BoardAdmin from './pages/BoardAdmin'
import HackathonAdmin from './pages/HackathonAdmin'
import AdminAccounts from './pages/AdminAccounts'
import SystemSettings from './pages/SystemSettings'
import StudentPreview from './pages/StudentPreview'
import HelpQueue from './pages/HelpQueue'

const MENU = [
  { to: '/', label: '대시보드', icon: IconLayoutDashboard, end: true },
  { to: '/cohorts', label: '기수 관리', icon: IconUsersGroup },
  { to: '/courses', label: '강좌 관리', icon: IconBook2 },
  { to: '/assignments', label: '과제 관리', icon: IconClipboardText },
  { to: '/hackathon', label: '해커톤 관리', icon: IconRocket },
  { to: '/surveys', label: '설문 관리', icon: IconChecklist },
  { to: '/quizzes', label: '퀴즈 관리', icon: IconPencilQuestion },
  { to: '/notices', label: '공지 관리', icon: IconSpeakerphone },
  { to: '/members', label: '회원 관리', icon: IconUsers },
  { to: '/inquiries', label: '1:1 문의 관리', icon: IconMessageCircleQuestion },
  { to: '/help', label: '도움 요청 대기열', icon: IconHandStop },
  { to: '/board', label: '게시판 관리', icon: IconMessages },
]

export default function AdminApp() {
  const { session, profile } = useAuth()

  if (session === undefined) return <Loading label="세션 확인 중…" />
  if (!session) {
    window.location.replace('/')
    return <Loading label="로그인 페이지로 이동 중…" />
  }
  if (!profile) return <Loading />
  if (profile.status !== 'active') return <InactiveAccount />
  if (profile.role === 'student') {
    window.location.replace('/')
    return <Loading label="학습자 페이지로 이동 중…" />
  }
  return (
    <CohortProvider>
      <AdminShell profile={profile} />
    </CohortProvider>
  )
}

function AdminShell({ profile }) {
  const location = useLocation()
  const { refresh } = useAuth()
  const toast = useToast()
  const { cohorts, selectedId, select } = useCohort()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const cohortScope = selectedId || null // 전체 기수 = null
  const unanswered = useOpenInquiryCount(location.pathname, cohortScope)
  const online = useOnlineStudentCount(cohortScope)
  const helpCount = useHelpQueueCount(cohortScope)
  const [nickOpen, setNickOpen] = useState(false)
  const [nick, setNick] = useState('')
  const [nickBusy, setNickBusy] = useState(false)
  const isSuper = profile.role === 'super_admin'
  const displayName = profile.nickname || profile.name

  async function saveNickname() {
    setNickBusy(true)
    const { error } = await supabase.from('profiles').update({ nickname: nick.trim() }).eq('id', profile.id)
    setNickBusy(false)
    if (error) { toast('닉네임 저장에 실패했습니다.', 'error'); return }
    toast('닉네임이 저장되었습니다. 학생 문의 답변에 이 이름이 표시됩니다.')
    setNickOpen(false)
    refresh()
  }

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

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
              {to === '/help' && helpCount > 0 && <span className="count-pill">{helpCount}</span>}
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
              <NavLink to="/preview" className={({ isActive }) => `inq-pill ${isActive ? 'hot-primary' : ''}`} title="선택한 기수의 학생에게 보이는 화면을 미리 봅니다">
                <IconEye size={14} stroke={1.75} />
                <span>미리보기</span>
              </NavLink>
              <NavLink to="/help" className={`inq-pill help-pill ${helpCount > 0 ? 'waiting' : ''}`} title={`학생 도움 요청 대기열${cohortScope ? '' : ' (전체 기수)'}`}>
                <IconHandStop size={14} stroke={1.75} />
                <span>도움 요청 <span className="tnum inq-count">{helpCount}명</span></span>
              </NavLink>
              <AdminPushComposer cohortId={selectedId} cohortName={cohorts.find((c) => c.id === selectedId)?.name} />
              <NavLink to="/inquiries" className={`inq-pill ${unanswered > 0 ? 'hot' : ''}`} title={`미답변 1:1 문의${cohortScope ? '' : ' (전체 기수)'}`}>
                <IconMessageCircleQuestion size={14} stroke={1.75} />
                <span>질문 <span className="tnum inq-count">{unanswered}건</span></span>
              </NavLink>
              <span className="live-pill" title={`현재 접속 중인 학생 수${cohortScope ? '' : ' (전체 기수)'}`}>
                <span className="live-dot" />
                <span className="tnum">접속 {online}명</span>
              </span>
              <VisitorCounter />
              <button className="row" style={{ gap: 8, background: 'transparent', border: 'none', padding: 0 }}
                title="클릭하여 닉네임 설정" onClick={() => { setNick(profile.nickname || ''); setNickOpen(true) }}>
                <span className="avatar">{(displayName || '?').slice(0, 1)}</span>
                <span className="t-label">{displayName}</span>
              </button>
            </div>
          </header>
          <Dialog open={nickOpen} title="닉네임 설정" onClose={() => setNickOpen(false)}
            actions={
              <>
                <button className="btn btn-white btn-sm" onClick={() => setNickOpen(false)} disabled={nickBusy}>취소</button>
                <button className="btn btn-primary btn-sm" onClick={saveNickname} disabled={nickBusy}>
                  {nickBusy ? '저장 중…' : '저장'}
                </button>
              </>
            }>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>닉네임</label>
              <input className="input" value={nick} maxLength={20} placeholder="예: AX운영팀"
                onChange={(e) => setNick(e.target.value)} />
              <span className="hint">학생 화면의 문의 답변·게시판에 실명 대신 이 닉네임이 표시됩니다. 비워 두면 이름이 표시됩니다.</span>
            </div>
          </Dialog>
          <main className="content wide" style={{ maxWidth: 1440 }}>
            <Routes>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/cohorts" element={<Cohorts />} />
              <Route path="/courses/*" element={<CoursesAdmin />} />
              <Route path="/assignments" element={<AssignmentMatrix />} />
              <Route path="/hackathon" element={<HackathonAdmin />} />
              <Route path="/surveys/*" element={<SurveysAdmin />} />
              <Route path="/quizzes/*" element={<QuizzesAdmin />} />
              <Route path="/notices" element={<NoticesAdmin />} />
              <Route path="/members" element={<Members />} />
              <Route path="/inquiries" element={<InquiriesAdmin />} />
              <Route path="/board" element={<BoardAdmin />} />
              <Route path="/preview" element={<StudentPreview />} />
              <Route path="/help" element={<HelpQueue />} />
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
