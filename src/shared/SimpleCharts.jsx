import { useEffect, useRef, useState } from 'react'

function useChartWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(560)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function chartCeiling(values) {
  const max = Math.max(0, ...values.map(value => Number(value) || 0))
  if (max === 0) return 1
  const base = 10 ** Math.floor(Math.log10(max / 4))
  const step = Math.max(1, base * (max / base > 20 ? 5 : 1))
  return Math.ceil(max * 1.15 / step) * step
}

function tickLabel(value) { return Number.isInteger(value) ? value : value.toFixed(1) }

function shortLabel(value, width) {
  const label = String(value ?? '')
  const max = Math.max(2, Math.floor(width / (/^[\p{ASCII}]*$/u.test(label) ? 6 : 9)))
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

export function VerticalBars({ data, valueKey, height = 150, maxBarWidth = 28, gradient = false, referenceIndex = -1, referenceLabel = '', ariaLabel }) {
  const [ref, width] = useChartWidth()
  const left = 34, right = width - 12, top = referenceIndex >= 0 ? 30 : 20, bottom = height - 27
  const values = data.map(row => Number(row[valueKey]) || 0)
  const ceiling = chartCeiling(values)
  const step = (right - left) / Math.max(data.length, 1)
  const barWidth = Math.min(maxBarWidth, step * 0.62)
  return <div ref={ref} style={{ width: '100%' }}>
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {gradient && <defs><linearGradient id="simpleVerticalGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3d6db3" /><stop offset="55%" stopColor="#1a3356" /><stop offset="100%" stopColor="#152945" />
      </linearGradient></defs>}
      {[0, 0.5, 1].map(fraction => {
        const y = bottom - fraction * (bottom - top)
        return <g key={fraction}>
          <line x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" />
          <text x={left - 5} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{tickLabel(ceiling * fraction)}</text>
        </g>
      })}
      {data.map((row, index) => {
        const value = values[index]
        const x = left + step * (index + 0.5)
        const barHeight = Math.max(0, value / ceiling * (bottom - top))
        return <g key={index} tabIndex="0">
          <title>{`${row.name}: ${value}${valueKey === '인원' ? '명' : ''}`}</title>
          <rect x={x - barWidth / 2} y={bottom - barHeight} width={barWidth} height={barHeight}
            rx="5" fill={gradient ? 'url(#simpleVerticalGradient)' : 'var(--chart-1)'} />
          <text x={x} y={Math.max(top + 10, bottom - barHeight - 5)} textAnchor="middle" fill="var(--foreground)" fontSize="11">{value}</text>
          <text x={x} y={height - 6} textAnchor="middle" fill="var(--muted)" fontSize="11">{shortLabel(row.name, step - 4)}</text>
        </g>
      })}
      {referenceIndex >= 0 && <g>
        <line x1={left + step * (referenceIndex + 0.5)} x2={left + step * (referenceIndex + 0.5)} y1={top} y2={bottom}
          stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" />
        <text x={Math.min(right - 5, left + step * (referenceIndex + 0.5))} y="14" textAnchor="end" fill="var(--accent-deep)" fontSize="11">{referenceLabel}</text>
      </g>}
    </svg>
  </div>
}

export function VisitLine({ data, height = 150 }) {
  const [ref, width] = useChartWidth()
  const left = 35, right = width - 12, top = 20, bottom = height - 26
  const values = data.map(row => Number(row.방문) || 0)
  const ceiling = chartCeiling(values)
  const point = (index) => ({ x: left + (right - left) * index / Math.max(data.length - 1, 1), y: bottom - values[index] / ceiling * (bottom - top) })
  const path = data.map((_, index) => { const { x, y } = point(index); return `${index ? 'L' : 'M'}${x},${y}` }).join(' ')
  const labelStep = Math.max(1, Math.ceil(data.length / 6))
  return <div ref={ref} style={{ width: '100%' }}>
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="방문 추이">
      {[0, 0.5, 1].map(fraction => {
        const y = bottom - fraction * (bottom - top)
        return <g key={fraction}>
          <line x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" />
          <text x={left - 5} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{tickLabel(ceiling * fraction)}</text>
        </g>
      })}
      <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((row, index) => {
        const { x, y } = point(index)
        return <g key={index} tabIndex="0">
          <title>{`${row.date}: ${values[index]}명 방문`}</title>
          <circle cx={x} cy={y} r="8" fill="transparent" />
          {(data.length <= 12 || index === data.length - 1) && <circle cx={x} cy={y} r="3" fill="var(--chart-1)" />}
          {(index % labelStep === 0 || index === data.length - 1) &&
            <text x={x} y={height - 6} textAnchor="middle" fill="var(--muted)" fontSize="11">{row.date}</text>}
        </g>
      })}
    </svg>
  </div>
}

export function HorizontalRates({ data }) {
  const [ref, width] = useChartWidth()
  const height = Math.max(220, data.length * 34 + 30)
  const left = Math.min(150, width * 0.38), right = width - 35, top = 30
  return <div ref={ref} className="dashboard-course-view-scroll">
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="강좌별 열람률">
      <defs><linearGradient id="simpleHorizontalGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3d6db3" /><stop offset="55%" stopColor="#1a3356" /><stop offset="100%" stopColor="#152945" />
      </linearGradient></defs>
      {[0, 25, 50, 75, 100].map(tick => {
        const x = left + (right - left) * tick / 100
        return <g key={tick}>
          <line x1={x} x2={x} y1={top - 3} y2={height - 8} stroke="var(--border)" />
          <text x={x} y="17" textAnchor="middle" fill="var(--muted)" fontSize="11">{tick}</text>
        </g>
      })}
      {data.map((row, index) => {
        const value = Math.max(0, Math.min(100, Number(row.열람률) || 0))
        const y = top + index * 34
        return <g key={index} tabIndex="0">
          <title>{`${row.name}: ${value}%`}</title>
          <text x={left - 8} y={y + 15} textAnchor="end" fill="var(--muted)" fontSize="11">{shortLabel(row.name, left - 12)}</text>
          <rect x={left} y={y} width={(right - left) * value / 100} height="20" rx="6" fill="url(#simpleHorizontalGradient)" />
          <text x={Math.min(width - 3, left + (right - left) * value / 100 + 5)} y={y + 15} fill="var(--foreground)" fontSize="11">{value}%</text>
        </g>
      })}
    </svg>
  </div>
}

export function ChoicePieChart({ data, total }) {
  const positive = data.filter(item => item.count > 0)
  const sum = positive.reduce((count, item) => count + item.count, 0)
  return <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="선택 항목별 응답 비율">
    {positive.map((item, index) => {
      const fraction = item.count / sum
      const angle = -Math.PI / 2 + positive.slice(0, index).reduce((count, current) => count + current.count, 0) / sum * Math.PI * 2
      const next = angle + fraction * Math.PI * 2
      const mid = (angle + next) / 2
      const path = positive.length === 1 ? null : `M 120 120 L ${120 + 112 * Math.cos(angle)} ${120 + 112 * Math.sin(angle)} A 112 112 0 ${fraction > 0.5 ? 1 : 0} 1 ${120 + 112 * Math.cos(next)} ${120 + 112 * Math.sin(next)} Z`
      const color = item.color
      const rgb = parseInt(color.slice(1), 16)
      const brightness = (((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114) / 1000
      return <g key={index} tabIndex="0">
        <title>{`${item.label}: ${item.count}명 (${total ? Math.round(item.count / total * 100) : 0}%)`}</title>
        {path ? <path d={path} fill={color} stroke="var(--background)" strokeWidth="2" />
          : <circle cx="120" cy="120" r="112" fill={color} stroke="var(--background)" strokeWidth="2" />}
        {fraction >= 0.05 && <text x={120 + 66 * Math.cos(mid)} y={120 + 66 * Math.sin(mid)}
          textAnchor="middle" dominantBaseline="central" fill={brightness >= 150 ? '#0f1419' : '#fff'} fontSize="13" fontWeight="700">
          {Math.round(fraction * 100)}%
        </text>}
      </g>
    })}
  </svg>
}
