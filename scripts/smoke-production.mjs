import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.LMS_TEST_URL || 'https://lms-axopenlab.vercel.app'
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true })
try {
  for (const path of ['/', '/admin.html']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [], daily = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/daily\.co|daily-esm/.test(request.url())) daily.push(true) })
    const response = await page.goto(base + path, { waitUntil: 'networkidle' })
    assert.equal(response.status(), 200)
    const headers = await response.allHeaders()
    assert.equal(headers['x-content-type-options'], 'nosniff'); assert.equal(headers['x-frame-options'], 'SAMEORIGIN')
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor()
    assert.deepEqual(errors, []); assert.equal(daily.length, 0)
    const initialJs = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/assets\/.*\.js/.test(r.name)).reduce((n, r) => n + r.encodedBodySize, 0))
    console.log(JSON.stringify({ path, status: 200, runtimeErrors: 0, idleDailyRequests: 0, initialJsBytes: initialJs }))
    await context.close()
  }
} finally { await browser.close() }
