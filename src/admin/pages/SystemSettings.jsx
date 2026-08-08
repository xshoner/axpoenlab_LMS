import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Loading, useToast } from '../../shared/ui'

export default function SystemSettings() {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('system_settings').select('*').then(({ data }) => {
      const map = {}
      for (const row of data || []) map[row.key] = row.value
      setSettings({
        allowed_extensions: (map.allowed_extensions || []).join(', '),
        max_file_size_mb: map.max_file_size_mb ?? 5,
        login_lock_attempts: map.login_lock_attempts ?? 5,
        login_lock_minutes: map.login_lock_minutes ?? 10,
        show_visitor_counter: map.show_visitor_counter !== false,
      })
    })
  }, [])

  if (!settings) return <Loading />

  async function save() {
    setBusy(true)
    try {
      const entries = [
        ['allowed_extensions', settings.allowed_extensions.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)],
        ['max_file_size_mb', Number(settings.max_file_size_mb) || 5],
        ['login_lock_attempts', Number(settings.login_lock_attempts) || 5],
        ['login_lock_minutes', Number(settings.login_lock_minutes) || 10],
        ['show_visitor_counter', !!settings.show_visitor_counter],
      ]
      for (const [key, value] of entries) {
        const { error } = await supabase.from('system_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() })
        if (error) throw error
      }
      toast('설정이 저장되었습니다.')
    } catch {
      toast('저장에 실패했습니다.', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
      <h2 className="t-h2">시스템 총괄 설정</h2>
      <div className="card-panel">
        <div className="field">
          <label>과제 허용 확장자 (쉼표 구분)</label>
          <input className="input" value={settings.allowed_extensions}
            onChange={(e) => setSettings({ ...settings, allowed_extensions: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>과제 파일 크기 제한 (MB)</label>
            <input className="input" type="number" min="1" value={settings.max_file_size_mb}
              onChange={(e) => setSettings({ ...settings, max_file_size_mb: e.target.value })} />
          </div>
          <div className="field">
            <label>방문자 카운터 표시</label>
            <div className="checkbox-row" style={{ height: 48 }}>
              <input id="vc" type="checkbox" checked={settings.show_visitor_counter}
                onChange={(e) => setSettings({ ...settings, show_visitor_counter: e.target.checked })} />
              <label htmlFor="vc">로그인 후 우측 상단에 표시</label>
            </div>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>로그인 제한 실패 횟수</label>
            <input className="input" type="number" min="3" value={settings.login_lock_attempts}
              onChange={(e) => setSettings({ ...settings, login_lock_attempts: e.target.value })} />
          </div>
          <div className="field">
            <label>로그인 제한 시간 (분)</label>
            <input className="input" type="number" min="1" value={settings.login_lock_minutes}
              onChange={(e) => setSettings({ ...settings, login_lock_minutes: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  )
}
