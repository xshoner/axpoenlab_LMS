import { createClient } from '@supabase/supabase-js'

// Publishable key는 클라이언트 노출이 허용된 공개 키입니다 (PRD 8.2).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ugelgndotyppgksbubot.supabase.co'
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_fa_0o4KQJ_idaojRXxiBOQ_yCJ35m0z'

const KEEP_FLAG = 'ax-lms-keep'

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
})

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
export const ANON_KEY = SUPABASE_KEY
