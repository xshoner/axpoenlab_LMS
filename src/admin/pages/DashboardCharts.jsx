import { HorizontalRates, VerticalBars, VisitLine } from '../../shared/SimpleCharts'

function OverviewCharts({ perCohort, visitRange, setVisitRange, visitSeries }) {
  return <div className="grid-2 mb-24">
    <div className="chart-panel">
      <h3 className="t-h3 mb-16">기수별 학생 수</h3>
      <VerticalBars data={perCohort} valueKey="학생수" gradient maxBarWidth={24} ariaLabel="기수별 학생 수" />
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
      {visitSeries.length === 0
        ? <div className="empty-state" style={{ padding: 24 }}>아직 방문 기록이 없습니다</div>
        : <VisitLine data={visitSeries} />}
    </div>
  </div>
}

export default function DashboardCharts({ kind, courseViewRates, ...overview }) {
  return kind === 'courseViews'
    ? <HorizontalRates data={courseViewRates} />
    : <OverviewCharts {...overview} />
}
