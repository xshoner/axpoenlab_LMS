import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'

function OverviewCharts({ perCohort, visitRange, setVisitRange, visitSeries }) {
  return <div className="grid-2 mb-24">
    <div className="chart-panel">
      <h3 className="t-h3 mb-16">기수별 학생 수</h3>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={perCohort}>
          <defs>
            <linearGradient id="barGradCohort" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3d6db3" />
              <stop offset="55%" stopColor="#1a3356" />
              <stop offset="100%" stopColor="#152945" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
          <Bar dataKey="학생수" fill="url(#barGradCohort)" radius={[6, 6, 0, 0]} maxBarSize={24}
            label={{ position: 'top', fontSize: 11 }} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-panel">
      <div className="row mb-16" style={{ gap: 6 }}>
        <h3 className="t-h3">방문 추이 {visitRange === 'month' ? '(최근 30일)' : '(최근 1년)'}</h3>
        <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
          <button className={`btn btn-sm ${visitRange === 'month' ? 'btn-primary' : 'btn-white'}`}
            onClick={() => setVisitRange('month')}>1개월</button>
          <button className={`btn btn-sm ${visitRange === 'year' ? 'btn-primary' : 'btn-white'}`}
            onClick={() => setVisitRange('year')}>연간</button>
        </div>
      </div>
      {visitSeries.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>아직 방문 기록이 없습니다</div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={visitSeries}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
            <Line type="monotone" dataKey="방문" stroke="var(--chart-1)" strokeWidth={2}
              dot={visitRange === 'year' ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 } : false}
              isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
}

function CourseViewChart({ courseViewRates }) {
  return <div className="dashboard-course-view-scroll">
    <ResponsiveContainer width="100%" height={Math.max(220, courseViewRates.length * 34)}>
      <BarChart data={courseViewRates} layout="vertical">
        <defs>
          {/* 가로 막대 — 두께 방향(위→아래) 그라디언트로 원통형 입체감 */}
          <linearGradient id="barGradView" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d6db3" />
            <stop offset="55%" stopColor="#1a3356" />
            <stop offset="100%" stopColor="#152945" />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
        <Bar dataKey="열람률" fill="url(#barGradView)" radius={[0, 6, 6, 0]} maxBarSize={20}
          label={{ position: 'right', fontSize: 11, formatter: (v) => `${v}%` }} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

export default function DashboardCharts({ kind, ...props }) {
  return kind === 'courseViews' ? <CourseViewChart {...props} /> : <OverviewCharts {...props} />
}
