import { useCallback, useEffect, useRef, useState } from 'react'
import { IconHandStop, IconPhoto, IconX, IconCheck } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { Dialog, useToast } from './ui'
import { uploadFile, storageSafeName, fmtBytes } from '../lib/helpers'

export const HELP_CATEGORIES = ['GitHub', '배포(Vercel 등)', 'AI 도구', 'API Key', '코드 오류', '기타']

/** 상대 대기시간 표기: 방금 / 3분 / 1시간 12분 */
export function waitLabel(from, now = Date.now()) {
  const sec = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  if (sec < 60) return '방금'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

/** 1분마다 다시 렌더링하기 위한 시계 */
export function useNowTick(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/* ============ 학생: 🙋 도움 요청 버튼 + 접수 다이얼로그 + 내 대기 상태 ============ */
export function StudentHelpButton({ cohortId }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(HELP_CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mine, setMine] = useState(null) // { id, status, position, ... } | null
  const fileInput = useRef(null)
  const now = useNowTick()

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc('my_help_position')
    setMine(data || null)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 내 요청 상태 변화(처리 시작·해결) 및 대기열 변동을 실시간 반영
  useEffect(() => {
    const ch = supabase.channel('lms-help-mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, (payload) => {
        const row = payload.new || payload.old
        if (row?.user_id === profile.id && payload.eventType === 'UPDATE' && payload.new?.status === 'in_progress' && payload.old?.status !== 'in_progress') {
          toast(`${payload.new.handler_name || '강사'}님이 도움 요청을 처리하기 시작했습니다.`)
        }
        if (row?.user_id === profile.id && payload.eventType === 'UPDATE' && payload.new?.status === 'resolved') {
          toast('도움 요청이 해결 처리되었습니다.')
        }
        refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id, refresh, toast])

  function pickFile(f) {
    if (!f) return
    if (!/^image\//.test(f.type)) { toast('스크린샷은 이미지 파일만 첨부할 수 있습니다.', 'error'); return }
    if (f.size > 10 * 1024 * 1024) { toast('스크린샷은 최대 10MB입니다.', 'error'); return }
    setFile(f)
  }

  async function submit() {
    const desc = description.trim()
    setBusy(true)
    try {
      let screenshot_path = null
      if (file) {
        screenshot_path = `${profile.id}/${storageSafeName(file.name)}`
        await uploadFile('help-files', screenshot_path, file)
      }
      const { error } = await supabase.from('help_requests').insert({
        cohort_id: cohortId || null, user_id: profile.id,
        student_name: profile.name, student_org: profile.org || '',
        category, description: desc, screenshot_path,
      })
      if (error) throw error
      toast('도움 요청이 접수되었습니다. 강사가 순서대로 도와드립니다.')
      setDescription(''); setFile(null)
      await refresh()
    } catch (e) {
      toast(`요청 접수에 실패했습니다. ${e?.message || ''}`, 'error')
    } finally { setBusy(false) }
  }

  async function cancel() {
    if (!mine) return
    setBusy(true)
    const { error } = await supabase.from('help_requests').delete().eq('id', mine.id)
    setBusy(false)
    if (error) { toast('취소에 실패했습니다.', 'error'); return }
    toast('도움 요청을 취소했습니다.')
    refresh()
  }

  const active = mine && (mine.status === 'waiting' || mine.status === 'in_progress')

  return (
    <>
      <button type="button" className={`inq-pill help-pill ${active ? (mine.status === 'in_progress' ? 'progress' : 'waiting') : ''}`}
        title="강사에게 실시간 도움 요청" onClick={() => setOpen(true)}>
        <IconHandStop size={14} stroke={1.75} />
        <span>
          {active
            ? (mine.status === 'in_progress' ? '처리 중' : `대기 ${mine.position}번째`)
            : '도움 요청'}
        </span>
      </button>

      <Dialog open={open} title="🙋 도움 요청" onClose={() => setOpen(false)}>
        {active ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className={`help-status ${mine.status}`}>
              {mine.status === 'in_progress' ? (
                <>
                  <IconCheck size={18} stroke={2} />
                  <div>
                    <div className="t-label">{mine.handler_name || '강사'}님이 지금 처리하고 있습니다</div>
                    <div className="t-caption" style={{ opacity: 0.85 }}>잠시만 기다려 주세요. 자리에서 화면을 준비해 두면 빨리 해결됩니다.</div>
                  </div>
                </>
              ) : (
                <>
                  <span className="help-pos">{mine.position}</span>
                  <div>
                    <div className="t-label">대기 {mine.position}번째 · {mine.category}</div>
                    <div className="t-caption" style={{ opacity: 0.85 }}>접수 {waitLabel(mine.created_at, now)} 전 · 강사가 순서대로 도와드립니다.</div>
                  </div>
                </>
              )}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              {mine.status === 'waiting' && (
                <button className="btn btn-white btn-sm" disabled={busy} onClick={cancel}>
                  <IconX size={14} stroke={1.75} /> 요청 취소
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <p className="t-muted-sm" style={{ margin: 0 }}>
              막힌 부분을 적어 두면 강사가 대기 순서대로 자리로 찾아가거나 답변합니다.
            </p>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>문제 유형</label>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {HELP_CATEGORIES.map((c) => (
                  <button key={c} type="button" className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-white'}`}
                    onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>현재 오류 설명 <span className="t-caption muted-soft">(선택 — 비워 두면 문제 유형만 전달됩니다)</span></label>
              <textarea className="textarea" style={{ minHeight: 90 }} maxLength={500}
                placeholder="예) vercel deploy 하면 Build Failed 라고 나옵니다. 오류 메시지: ..."
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>스크린샷 <span className="t-caption muted-soft">(선택 · 이미지 10MB 이내)</span></label>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-white btn-sm" onClick={() => fileInput.current?.click()}>
                  <IconPhoto size={14} stroke={1.75} /> {file ? '다른 이미지 선택' : '이미지 첨부'}
                </button>
                {file && <span className="t-caption muted-soft">{file.name} ({fmtBytes(file.size)})</span>}
                {file && <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="첨부 제거"><IconX size={14} stroke={1.75} /></button>}
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
              </div>
            </div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-white btn-sm" disabled={busy} onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary btn-sm sheen" disabled={busy} onClick={submit}>
                <IconHandStop size={14} stroke={1.75} /> {busy ? '접수 중…' : '도움 요청'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

/* ============ 관리자: 대기 중 도움 요청 수 (실시간) ============ */
export function useHelpQueueCount(cohortId = null) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const fetchCount = () => {
      let q = supabase.from('help_requests').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'in_progress'])
      if (cohortId) q = q.eq('cohort_id', cohortId)
      q.then(({ count: c }) => { if (alive) setCount(c || 0) })
    }
    fetchCount()
    const ch = supabase.channel('lms-help-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, fetchCount)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [cohortId])
  return count
}
