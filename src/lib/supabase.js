import { createClient } from '@supabase/supabase-js'

// Publishable key는 클라이언트 노출이 허용된 공개 키입니다 (PRD 8.2).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ugelgndotyppgksbubot.supabase.co'
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_fa_0o4KQJ_idaojRXxiBOQ_yCJ35m0z'

const KEEP_FLAG = 'ax-lms-keep'

export function getAdminView() {
  if (!window.location.pathname.endsWith('/admin.html')) return null
  try {
    const view = JSON.parse(sessionStorage.getItem('ax-admin-view') || 'null')
    return /^[0-9a-f-]{36}$/i.test(view?.id || '') ? view : null
  } catch { return null }
}

export function openAdminView(admin) {
  sessionStorage.setItem('ax-admin-view', JSON.stringify({ id: admin.id, name: admin.name }))
  window.location.href = '/admin.html#/'
  window.location.reload()
}

export function closeAdminView() {
  sessionStorage.removeItem('ax-admin-view')
  window.location.href = '/admin.html#/admins'
  window.location.reload()
}

// "로그인 상태 유지" 미선택 시 sessionStorage에 세션 저장
const dynamicStorage = {
  getItem: (key) =>
    localStorage.getItem(KEEP_FLAG) === '0'
      ? sessionStorage.getItem(key)
      : localStorage.getItem(key),
  setItem: (key, value) => {
    if (localStorage.getItem(KEEP_FLAG) === '0') sessionStorage.setItem(key, value)
    else localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
  },
}

export function setKeepSignedIn(keep) {
  localStorage.setItem(KEEP_FLAG, keep ? '1' : '0')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: dynamicStorage, persistSession: true, autoRefreshToken: true },
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers)
      const view = getAdminView()
      if (view?.id) {
        headers.set('x-admin-view', view.id)
        const path = new URL(url).pathname
        const method = (options.method || 'GET').toUpperCase()
        const readRpc = /\/rpc\/(admin_master_course_list|admin_cohort_course_list|master_library_group_list|admin_dashboard_overview|visit_stats|record_visit|visit_series|today_account_visits|get_board_guest_token|online_student_count|get_forced_signup_cohort)$/.test(path)
        const signedDownload = path.includes('/storage/v1/object/sign/')
        if (!['GET', 'HEAD'].includes(method) &&
            (path.includes('/rest/v1/') || path.includes('/storage/v1/') || path.includes('/functions/v1/')) &&
            !readRpc && !signedDownload) {
          return Promise.resolve(new Response(JSON.stringify({ message: '관리자 화면 확인 모드에서는 변경할 수 없습니다.', code: 'READ_ONLY_VIEW' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }))
        }
      }
      return fetch(url, { ...options, headers })
    },
  },
})

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
export const ANON_KEY = SUPABASE_KEY

// 인증 메일은 개발 서버에서 요청하더라도 실제 서비스로 돌아오게 한다.
export const AUTH_REDIRECT_URL = `${
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://lms-axopenlab.vercel.app'
}/`
