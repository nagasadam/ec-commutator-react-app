// Process Scan phone app (scan/). Usage: E2E_URL=<main app address> node --test tests/e2e/scan.e2e.mjs
// (SCAN_URL overrides the phone app address; by default it is <E2E_URL>/scan/index.html.)
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { qrText, bizTag } from '../../src/lib/process.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_MODULE || 'playwright')
const target = process.env.E2E_URL || process.argv.find((a) => /^(https?:|file:)/.test(a))
const url = process.env.SCAN_URL || (target && new URL('scan/index.html', target).href)
assert.ok(url, 'set E2E_URL (or SCAN_URL)')

const BIZ = 'abc123xyz'
const TAG = bizTag(BIZ)
const META = { approve: true, vendors: [{ id: 's1', name: 'Sri Lakshmi Stackers' }], lots: [{ lot: 'STK-0042', type: 'ec', sup: 's1', expected: 1000 }], stock: {} }
const CODE = 'input[placeholder="V4|STACKING|ab12"]'
const btn = (p, t) => p.click(`button:text-is("${t}")`)

let browser
let page
const errors = []
test.before(async () => {
  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(([biz, meta]) => {
    if (!localStorage.getItem('processscan1')) localStorage.setItem('processscan1', JSON.stringify({ biz, queue: [], meta }))
  }, [BIZ, META])
  await page.goto(url)
  await page.waitForSelector('text=Scan a process QR')
})
test.after(async () => {
  await browser?.close()
})

const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('processscan1')).queue)
const enter = async (process) => {
  await page.fill(CODE, qrText(TAG, process))
  await btn(page, 'Go')
}
const send = async () => {
  await btn(page, 'Review')
  await btn(page, 'Send')
  await page.waitForSelector('text=Saved on this phone')
  await btn(page, 'Scan another')
}

test('phone app: issue to a vendor queues a scan with a lot number', async () => {
  await enter('stacking')
  await page.click('text=Issue to vendor')
  await page.click('button.type:has-text("EC")')
  await page.selectOption('select', 's1')
  await page.fill('.stepper input.big', '1000')
  await send()
  const q = await queue()
  assert.equal(q.length, 1)
  assert.deepEqual([q[0].process, q[0].action, q[0].type, q[0].qty, q[0].sup], ['stacking', 'issue', 'ec', 1000, 's1'])
  assert.match(q[0].lot, /^STK-\d{4}$/)
})

test('phone app: receive a lot back and a moulding run', async () => {
  await enter('stacking')
  await page.click('text=Receive back')
  await page.click('button.type:has-text("EC")')
  await page.selectOption('select', 'STK-0042')
  await page.fill('.stepper input.big', '980')
  await send()
  await enter('moulding')
  await page.click('button.type:has-text("750")')
  await page.fill('.stepper input.big', '500')
  await send()
  const q = await queue()
  assert.equal(q.length, 3)
  assert.deepEqual([q[1].action, q[1].lot, q[1].qty], ['receive', 'STK-0042', 980])
  assert.deepEqual([q[2].process, q[2].action, q[2].type, q[2].qty], ['moulding', 'run', 'w750', 500])
})

test('phone app: refuses junk and other businesses QR codes', async () => {
  await page.fill(CODE, 'junk')
  await btn(page, 'Go')
  assert.match(await page.locator('.err').innerText(), /not one of this factory/)
  await page.fill(CODE, qrText('ZZZ', 'stacking'))
  await btn(page, 'Go')
  assert.match(await page.locator('.err').innerText(), /different business/)
})

test('phone app: no script errors', () => {
  assert.deepEqual(errors, [])
})

test('phone app: opens with no signal after one visit online', async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.addInitScript(([biz, meta]) => {
    if (!localStorage.getItem('processscan1')) localStorage.setItem('processscan1', JSON.stringify({ biz, queue: [], meta }))
  }, [BIZ, META])
  await p.goto(url)
  await p.waitForSelector('text=Scan a process QR')
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.reload() // now controlled by the service worker, and everything the page needs is saved
  await p.waitForSelector('text=Scan a process QR')
  await ctx.setOffline(true)
  await p.reload()
  await p.waitForSelector('text=Scan a process QR', { timeout: 10000 })
  const manifest = await p.evaluate(() => document.querySelector('link[rel=manifest]')?.href)
  assert.match(manifest || '', /manifest\.webmanifest$/)
  await b.close()
})
