import { transform } from 'esbuild'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Run the actual dialog's group-load effect, then render its resulting options.
// Only hooks, contexts and the DB boundary are mocked; no live data is used.
const source = fs.readFileSync('src/admin/pages/Cohorts.jsx', 'utf8')
const start = source.indexOf('function SnapshotDialog(')
const end = source.indexOf('function ReorderDialog(', start)
assert.ok(start >= 0 && end > start, 'assignment dialog exists')
const { code } = await transform(source.slice(start, end), { loader: 'jsx', jsx: 'transform' })
let ctx
const useState = (initial) => {
  const i = ctx.cursor++
  if (!(i in ctx.states)) ctx.states[i] = initial
  return [ctx.states[i], (next) => { ctx.states[i] = typeof next === 'function' ? next(ctx.states[i]) : next }]
}
const supabase = { rpc: (...args) => ctx.db.rpc(...args), from: (...args) => ctx.db.from(...args) }
const SnapshotDialog = new Function('React', 'useState', 'useEffect', 'useAuth', 'getAdminView', 'supabase', 'useToast', 'Dialog', 'Loading', 'EmptyState', `${code}; return SnapshotDialog;`)(
  React, useState, (fn) => ctx.effects.push(fn), () => ({ profile: ctx.profile }), () => ctx.view,
  supabase, () => (...args) => ctx.toasts.push(args), ({ children }) => children, () => null, ({ title }) => title,
)
const shared = { id: 'shared', name: 'AI 활용 기본 과정', is_default: true }
const mine = { id: 'admin-a', name: '내 강좌' }
const other = { id: 'admin-b', name: '내 강좌' }
for (const [role, view] of [['super_admin', null], ['admin', null], ['super_admin', { id: 'admin-a' }]]) {
  const isGlobal = role === 'super_admin' && !view
  const requests = []
  ctx = { profile: { role }, view, states: [], cursor: 0, effects: [], toasts: [], db: {
    rpc(name) {
      requests.push(name)
      assert.equal(name, 'master_library_group_list')
      return Promise.resolve({ data: [shared] })
    },
    from(table) {
      requests.push(table)
      const query = { select: () => query, order: () => query, then: (fn) => Promise.resolve({ data: isGlobal ? [shared, mine, other] : [shared, mine] }).then(fn) }
      return query
    },
  } }
  const render = () => { ctx.cursor = 0; return renderToStaticMarkup(React.createElement(SnapshotDialog, { cohort: { id: 'cohort', name: '테스트 기수' }, onClose() {} })) }
  render()
  ctx.effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const html = render()
  assert.ok(html.includes('value="shared"'), 'shared master group is assignable')
  assert.equal(html.includes('>내 강좌</option>'), !isGlobal, `${role} ${view ? 'preview' : 'normal'} personal groups`)
  assert.equal(html.includes('value="admin-b"'), false, 'another administrator group must not be offered')
  assert.deepEqual(requests, [isGlobal ? 'master_library_group_list' : 'master_course_groups'])
  assert.deepEqual(ctx.toasts, [])
}
console.log('PASS: assignment dialog hides administrator personal groups for super-admins and preserves scoped administrator groups')
