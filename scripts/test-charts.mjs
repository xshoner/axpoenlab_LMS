import assert from 'node:assert/strict'
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

fs.mkdirSync('.bkit', { recursive: true })
const output = path.resolve('.bkit/charts-test.mjs')
try {
  await build({ entryPoints: ['src/shared/SimpleCharts.jsx'], outfile: output, bundle: true,
    format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' })
  const { VerticalBars, VisitLine, HorizontalRates, ChoicePieChart } = await import(pathToFileURL(output))
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))

  const bars = render(VerticalBars, { data: [{ name: '기수 A', 학생수: 3 }], valueKey: '학생수', ariaLabel: '기수별 학생 수' })
  assert.match(bars, /aria-label="기수별 학생 수"/)
  assert.match(bars, /<title>기수 A: 3<\/title>/)

  const line = render(VisitLine, { data: [{ date: '10.06', 방문: 2 }, { date: '10.07', 방문: 7 }] })
  assert.match(line, /<title>10.07: 7명 방문<\/title>/)
  assert.match(line, /<path d="M/)

  const rates = render(HorizontalRates, { data: [{ name: '강좌 A', 열람률: 75 }] })
  assert.match(rates, /<title>강좌 A: 75%<\/title>/)

  const pie = render(ChoicePieChart, { data: [
    { label: '선택 A', count: 3, color: '#2a78d6' }, { label: '선택 B', count: 1, color: '#eb6834' },
  ], total: 4 })
  assert.match(pie, /<title>선택 A: 3명 \(75%\)<\/title>/)
  assert.match(pie, />75%<\/text>/)
  assert.match(pie, />25%<\/text>/)
  assert.doesNotMatch(pie, /NaN/)

  const single = render(ChoicePieChart, { data: [{ label: '단일', count: 4, color: '#2a78d6' }], total: 4 })
  assert.match(single, /<circle cx="120" cy="120" r="112"/)
  console.log('PASS: lightweight charts retain accessible counts, percentages, visit labels and single-choice geometry')
} finally {
  fs.rmSync(output, { force: true })
}
