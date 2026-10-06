import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/helpers'
import { Loading, StatCard } from '../../shared/ui'
import { LoadError } from '../../shared/errors'

const TYPES = { profiles: '회원 상태·권한', cohort_members: '기수 배정', cohorts: '기수', master_courses: '마스터 강좌', cohort_courses: '기수 강좌', quiz_submissions: '퀴즈 채점', screen_share_sessions: '화면공유', system_settings: '운영 설정' }
const ACTIONS = { insert: '생성', update: '변경', delete: '삭제', starting: '공유 준비', live: '공유 시작', stopping: '공유 해제', ended: '공유 종료', graded: '채점' }
export default function Operations() {
  const [data, setData] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    const read = async () => {
      const { data, error } = await supabase.rpc('operations_status')
      if (!alive) return
      setError(!!error); if (!error) setData(data)
    }
    void read()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void read() }, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [retry])
  if (error) return <LoadError retry={() => setRetry(x => x + 1)} />
  if (!data) return <Loading />
  return <div className="stack" style={{ gap: 24 }}>
    <div className="row-between"><h1 className="t-h2">운영 현황</h1><button className="btn btn-white btn-sm" onClick={() => setRetry(x => x + 1)}>새로고침</button></div>
    <div className="kpi-row">
      <StatCard label="최근 24시간 오류" value={data.errors24h} />
      <StatCard label="진행 중 화면공유" value={data.activeShares} />
      <StatCard label="이달 화면공유" value={`${data.monthlyMinutes} 인·분`} caption="접속 인원 샘플 기준 추정" />
      <StatCard label="등록된 파일" value={data.files} />
      <StatCard label="점수 보호" value={data.integrityProtected ? '정상' : '확인 필요'} />
    </div>
    {(data.overdueShares > 0 || data.stoppingShares > 0 || data.watchdogConfigured === false) && <section className="card-panel" role="alert">
      <h2 className="t-h3 mb-16">화면공유 종료 감시</h2>
      {data.watchdogConfigured === false && <p>종료 감시 작업 또는 서버 인증 설정을 확인해 주세요.</p>}
      {data.stoppingShares > 0 && <p>연결 해제 처리 중인 공유가 {data.stoppingShares}건 있습니다. 서버 퇴장 확인 전까지 새 공유를 차단합니다.</p>}
      {data.overdueShares > 0 && <p>연결 제한 시간을 넘긴 공유가 {data.overdueShares}건 있습니다. 종료 감시 결과를 확인해 주세요.</p>}
    </section>}
    <section className="card-panel"><h2 className="t-h3 mb-16">자동 백업</h2>
      <p className="t-muted-sm">매일 오전 3시 30분에 데이터와 파일을 암호화해 GitHub Actions에 30일간 보관합니다. 백업마다 복호화와 파일 무결성을 검사합니다.</p>
      <p>{data.backup ? `최근 검증: ${fmtDate(data.backup.created_at, true)} · ${data.backup.table_count}개 테이블 · ${data.backup.file_count}개 파일` : '아직 검증된 백업이 없습니다.'}</p>
      {(!data.backup || Date.now() - new Date(data.backup.created_at).getTime() > 48 * 3600000) && <p role="alert">백업 실행 결과를 확인해 주세요.</p>}
    </section>
    <section className="card-panel"><h2 className="t-h3 mb-16">최근 오류 · 7일</h2>
      {data.errors.length ? <table className="data-table"><thead><tr><th>영역</th><th>오류 코드</th><th>횟수</th><th>최근 발생</th></tr></thead><tbody>{data.errors.map(e => <tr key={e.category + e.code}><td>{e.category}</td><td>{e.code}</td><td>{e.count}</td><td>{fmtDate(e.last_at, true)}</td></tr>)}</tbody></table> : <p className="t-muted-sm">기록된 오류가 없습니다.</p>}
    </section>
    <section className="card-panel"><h2 className="t-h3 mb-16">운영 변경 이력</h2>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>시간</th><th>대상</th><th>작업</th><th>실행 계정</th></tr></thead><tbody>{data.events.map(e => <tr key={e.id}><td>{fmtDate(e.created_at, true)}</td><td title={e.target_id}>{TYPES[e.target_type] || e.target_type}</td><td>{ACTIONS[e.action] || e.action}</td><td title={e.actor_id || ''}>{e.actor_id ? e.actor_id.slice(0,8) : '서버 작업'}</td></tr>)}</tbody></table></div>
    </section>
    <section className="card-panel"><h2 className="t-h3 mb-16">자동 정리 작업</h2>
      <p className="t-muted-sm mb-16">자동 작업의 최근 실행 결과입니다. 작업 성공은 종료 요청 접수를 뜻하며, 화면공유 연결 해제 완료는 공유 상태로 확인합니다.</p>
      <table className="data-table"><thead><tr><th>작업</th><th>상태</th><th>시작</th></tr></thead><tbody>{data.cron.map((c,i) => <tr key={i}><td>{c.jobid}</td><td>{c.status === 'succeeded' ? '정상' : c.status === 'running' ? '실행 중' : '확인 필요'}</td><td>{fmtDate(c.start_time, true)}</td></tr>)}</tbody></table>
    </section>
  </div>
}
