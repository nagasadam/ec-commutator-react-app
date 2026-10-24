// Browser tests. Usage: node tests/e2e/app.e2e.mjs <path-to-built-index.html | http://url>
// `npm run test:e2e` builds with Vite and serves dist/ first (see package.json).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_MODULE || 'playwright')
const target = process.env.E2E_URL || process.argv.find((a) => /^(https?:|file:)/.test(a))
assert.ok(target, 'set E2E_URL to the app address')

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPdf } from '../../src/lib/pdf.js'

// PDF.js is fetched from cdnjs by the app; tests serve a local copy (override with PDFJS_DIR).
const PDFJS_DIR = process.env.PDFJS_DIR || fileURLToPath(new URL('../../node_modules/pdfjs-dist/build', import.meta.url))
const pdfFile = (name, lines) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(buildPdf({ title: 'TAX INVOICE', blocks: lines.map((p) => ({ p })) })) })

let browser
const pages = []
test.before(async () => {
  browser = await chromium.launch()
})
test.afterEach(async () => {
  while (pages.length) await pages.pop().context().close()
})
test.after(async () => browser.close())

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true, ...opts })
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\//, (r) => {
    const file = /worker/.test(r.request().url()) ? 'pdf.worker.min.mjs' : 'pdf.min.mjs'
    r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(`${PDFJS_DIR}/${file}`) })
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errs.push(m.text()))
  await p.addInitScript(() => {
    if (!localStorage.getItem('__seeded')) window.__EC_SEED_DEMO__ = true
  })
  await p.goto(target)
  p.errs = errs
  pages.push(p)
  return p
}
const tab = (p, t) => p.click(`nav >> text=${t}`)

test('guide figures all match on the demo business', async () => {
  const p = await open()
  await tab(p, 'Reports')
  assert.equal(await p.locator('.pill.ok', { hasText: 'Match' }).count(), 10)
  assert.deepEqual(p.errs, [])
})

test('toaster: confirms a save, replaces instead of stacking, persists to localStorage', async () => {
  const p = await open()
  await tab(p, 'Banking')
  await p.fill('label:has-text("Cash opening") input', '31000')
  await p.locator('.toast', { hasText: 'Saved' }).waitFor()
  await p.fill('label:has-text("Cash opening") input', '31500')
  assert.equal(await p.locator('.toast', { hasText: 'Saved' }).count(), 1)
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].cashOpen)
  assert.equal(stored, 31500)
  await p.locator('.toast').waitFor({ state: 'detached', timeout: 5000 }) // fades out
})

test('toaster: a failed save shows a persistent error toast and the red bar', async () => {
  const p = await open()
  await p.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
  })
  await tab(p, 'Banking')
  await p.fill('label:has-text("Cash opening") input', '1')
  const t = p.locator('.toast.err')
  await t.waitFor()
  assert.match(await t.innerText(), /Not saved/)
  assert.ok(await p.locator('.err.sticky').count())
  assert.match(await p.locator('.live').getAttribute('title'), /Not saved/)
  await p.waitForTimeout(3000)
  assert.equal(await p.locator('.toast.err').count(), 1) // errors do not fade
})

test('invoice: creating a bill for a person, then viewing a firm invoice shows IGST', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  await p.selectOption('form select >> nth=0', { label: 'Ramesh Pillai (person · BILL)' })
  await p.selectOption('.lrow select', { label: 'Commutator (pcs)' })
  await p.fill('.lrow input >> nth=0', '10')
  await p.click('button:has-text("Create")')
  assert.equal(await p.locator('td', { hasText: 'BILL-0002' }).count(), 1)
  await p.locator('tr', { hasText: 'INV-0002' }).locator('text=View').click()
  assert.match(await p.locator('.paper').innerText(), /IGST 18%/)
})

test('ledger: statement shows the party balance and downloads a real PDF', async () => {
  const p = await open()
  await tab(p, 'Ledgers')
  await p.selectOption('label:has-text("Party") select', { label: 'Sunrise Armatures' })
  assert.ok(await p.locator('tr', { hasText: 'Opening balance' }).count())
  assert.ok(await p.locator('td', { hasText: 'Invoice' }).count())
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download PDF")')])
  const path = await dl.path()
  const bytes = (await import('node:fs')).readFileSync(path)
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  assert.match(bytes.toString('latin1'), /Sunrise Armatures/)
  await p.locator('.toast', { hasText: 'PDF' }).waitFor()
})

test('reports: daybook, balance sheet and trial balance all balance', async () => {
  const p = await open()
  await tab(p, 'Reports')
  await p.click('[role=tab]:has-text("Daybook")')
  assert.ok((await p.locator('.card table tbody tr').count()) > 20)
  await p.click('[role=tab]:has-text("Balance sheet")')
  await p.locator('text=Assets equal liabilities plus equity.').waitFor()
  await p.click('[role=tab]:has-text("Trial balance")')
  await p.locator('text=Debits equal credits.').waitFor()
})

test('cash & GPay people: pin shows up first and adds no transaction', async () => {
  const p = await open()
  const n = () => p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].tx.length)
  await tab(p, 'Cash & GPay')
  assert.ok(await p.locator('td', { hasText: 'Ramesh Pillai' }).count())
  await p.click('button:has-text("Apex Motors")')
  await p.locator('[aria-label="Unpin Apex Motors Pvt Ltd"]').waitFor()
  assert.equal(await p.locator('tbody tr').first().locator('td').nth(1).innerText(), 'Apex Motors Pvt Ltd')
  assert.equal(await n(), 7)
})

test('firm rules: a firm-based business refuses persons and cash', async () => {
  const p = await open()
  await p.click('button:has-text("Manage")')
  await p.fill('label:has-text("Name") input', 'Firm Co')
  await p.selectOption('label:has-text("Type") select >> nth=0', 'firm')
  await p.click('button:text-is("Add")')
  await tab(p, 'Parties')
  const opts = await p.locator('label:has-text("Type") select >> nth=0').locator('option').allInnerTexts()
  assert.ok(opts.every((o) => !/Person/.test(o)))
  await p.fill('label:has-text("Name") input >> nth=0', 'Bad GST')
  await p.fill('label:has-text("GSTIN") input >> nth=0', 'XYZ')
  await p.click('button:text-is("Add") >> nth=0')
  assert.match(await p.locator('.err').first().innerText(), /GSTIN/)
})

test('backup: export downloads JSON, import of bad file shows an error toast and changes nothing', async () => {
  const p = await open()
  await p.click('button:has-text("Manage")')
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Export all data")')])
  const j = JSON.parse((await import('node:fs')).readFileSync(await dl.path(), 'utf8'))
  assert.equal(j.format, 'ec-commutator-backup')
  assert.equal(j.data.biz[0].inv.length, 4)
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/bad-backup.json', 'not json')
  await p.setInputFiles('.modal input[type=file]', '/tmp/bad-backup.json')
  await p.locator('.toast.err', { hasText: 'Import failed' }).waitFor()
  fs.writeFileSync('/tmp/good-backup.json', JSON.stringify(j))
  await p.setInputFiles('.modal input[type=file]', '/tmp/good-backup.json')
  await p.locator('.toast', { hasText: 'Imported 1 business' }).waitFor()
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz.length), 2)
})

test('reload before any edit keeps the same business id (no new business, no save toast)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } })
  const p = await ctx.newPage()
  pages.push(p)
  await p.goto(target)
  await p.locator('nav').waitFor()
  const id1 = await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10') || 'null')?.cur)
  assert.ok(id1, 'the starting business is written to storage on first load')
  await p.reload()
  await p.locator('nav').waitFor()
  const id2 = await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10') || 'null')?.cur)
  assert.equal(id2, id1)
  assert.equal(await p.locator('.toast').count(), 0)
})

test('reload keeps data; no horizontal overflow on a phone', async () => {
  const p = await open({ viewport: { width: 390, height: 844 }, isMobile: true })
  for (const t of ['Invoices', 'Reports', 'Ledgers', 'Cash & GPay', 'Banking']) {
    await tab(p, t)
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, t)
  }
  await tab(p, 'Banking')
  await p.fill('label:has-text("Cash opening") input', '777')
  await p.locator('.toast').waitFor()
  // Chromium flushes file:// localStorage to its store asynchronously; give it a moment before reloading.
  await p.waitForTimeout(600)
  await p.reload()
  await tab(p, 'Banking')
  assert.equal(await p.inputValue('label:has-text("Cash opening") input'), '777')
})

// ------------------------------------------------------------ PDF import
const ASHOK = (qty1 = 1000, qty2 = 1000) => [
  'E.C COMMUTATORS', 'GSTIN: 33AAACE1111A1Z5', 'Invoice No: 66 Invoice Date: 17.10.2024', 'To,(BUYER BILLED ADDRESS)', 'ASHOK ENGINEERING WORKS',
  '1/424/66-A, SHAHDRA FLYOVER,', 'SHAHDRA, NEW DELHI -110032', 'GSTIN: 07AAKPB7527M1ZF Ph No: 9810209580', 'Name of transport: V R L logistics Ltd',
  'LR No: 77881 Dt 18.10.2024', 'Sl Description HSN Qty Rate Amount',
  `1 COMMUTATOR 85030090 ${qty1} Nos 25.00 ${(qty1 * 25).toFixed(2)}`, `2 COMMUTATOR 85030090 ${qty2} Nos 18.50 ${(qty2 * 18.5).toFixed(2)}`, 'Total', 'IGST 18%',
]
const APEX = ['Bill To', 'Apex Motors Pvt Ltd', 'GSTIN: 33AAACA1234B1Z5', 'Invoice Date: 01.10.2026', 'Sl Description HSN Qty Rate Amount', '1 Commutator 8503 10 Nos 95.00 950.00', 'Total']
// Until the first edit nothing is stored, which means the seeded demo (4 invoices, 3 customers) is untouched.
const invCount = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10'))?.biz[0].inv.length ?? 4)

test('PDF import, auto on: complete PDF creates the invoice straight away', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  assert.ok(await p.locator('.chk input').isChecked()) // on by default
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('apex.pdf', APEX))
  await p.locator('.pdfnote.ok', { hasText: 'Saved INV-0004 for Apex Motors Pvt Ltd' }).waitFor()
  await p.locator('.toast', { hasText: 'INV-0004' }).waitFor()
  assert.equal(await invCount(p), 5)
  // the same PDF again must not be saved twice
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('apex.pdf', APEX))
  await p.locator('.pdfnote.warn', { hasText: 'identical invoice' }).waitFor()
  assert.equal(await invCount(p), 5)
})

test('PDF import, auto on: incomplete data stays in the form with reasons (stock, new customer filled in)', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('ashok.pdf', ASHOK()))
  const note = p.locator('.pdfnote.warn')
  await note.waitFor()
  assert.match(await note.innerText(), /Not saved automatically/)
  assert.match(await note.innerText(), /Not enough stock/)
  assert.equal(await invCount(p), 4)
  assert.equal(await p.inputValue('.newparty label:has-text("Name") input'), 'ASHOK ENGINEERING WORKS')
  assert.equal(await p.inputValue('.newparty label:has-text("GSTIN") input'), '07AAKPB7527M1ZF')
  assert.equal(await p.inputValue('.newparty label:has-text("Phone") input'), '9810209580')
  assert.equal(await p.inputValue('label:has-text("Date") input'), '2024-10-17')
  assert.equal(await p.inputValue('label:has-text("LR number") input'), '77881')
  assert.equal(await p.inputValue('label:has-text("Transporter") input'), 'V R L logistics Ltd')
  assert.equal(await p.locator('.lrow').count(), 2)
})

test('PDF import, auto off: form is filled, nothing saved until Create; customer added with the invoice', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  await p.uncheck('.chk input')
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('ashok.pdf', ASHOK(10, 10)))
  await p.locator('.pdfnote.warn', { hasText: 'Check it' }).waitFor()
  assert.equal(await invCount(p), 4)
  const custs = () => p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10'))?.biz[0].cust.length ?? 3)
  assert.equal(await custs(), 3)
  await p.click('button:has-text("Create")')
  await p.locator('td', { hasText: 'INV-0004' }).waitFor()
  assert.equal(await custs(), 4)
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].cust.at(-1))
  assert.deepEqual([c.name, c.phone, c.gstin], ['ASHOK ENGINEERING WORKS', '9810209580', '07AAKPB7527M1ZF'])
  assert.equal(await p.locator('.newparty').count(), 0)
})

test('PDF import: a new firm without GSTIN blocks Create until one is entered; dismiss adds nothing', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  await p.uncheck('.chk input')
  const noGst = ASHOK(10, 10).map((l) => l.replace('GSTIN: 07AAKPB7527M1ZF Ph No: 9810209580', 'Ph No: 9810209580'))
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('x.pdf', noGst))
  await p.locator('.newparty').waitFor()
  await p.click('button:has-text("Create")')
  assert.match(await p.locator('.err').first().innerText(), /GSTIN/)
  await p.fill('.newparty label:has-text("GSTIN") input', '07AAKPB7527M1ZF')
  await p.click('button:has-text("Dismiss")')
  assert.equal(await p.locator('.newparty').count(), 0)
  assert.equal(await invCount(p), 4)
})

test('PDF import: unreadable PDFs say why', async () => {
  const p = await open()
  await tab(p, 'Invoices')
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('scan.pdf', []))
  await p.locator('.pdfnote.err', { hasText: 'scan' }).waitFor()
  await p.setInputFiles('[data-testid=pdf-input]', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10)]) })
  await p.locator('.pdfnote.err', { hasText: '10 MB' }).waitFor()
  await p.setInputFiles('[data-testid=pdf-input]', { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('plain text') })
  await p.locator('.pdfnote.err', { hasText: 'not a PDF' }).waitFor()
})

test('PDF import: the Save automatically choice is remembered', async () => {
  const p = await open()
  await tab(p, 'Purchases')
  await p.uncheck('.chk input')
  await p.reload()
  await tab(p, 'Purchases')
  assert.equal(await p.locator('.chk input').isChecked(), false)
})

const PUR = [
  'TAX INVOICE', 'Gupta Metals Pvt Ltd', '4 Mill Road, Coimbatore', 'GSTIN: 33AAACG5555F1Z5 Ph: 9876543210', 'Invoice Date: 02/10/2026', 'Date of Supply: 05/10/2026',
  'Bill To', 'E.C Commutators', 'Sl Description HSN Qty Rate Amount', '1 Copper coil 7408 100 Kg 1500.00 150000.00', '2 Brass insert 7419 500 Pcs 3.00 1500.00', 'Total',
]
const purs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].pur)

test('PDF import purchases, auto on: one purchase per row, Pay later, new supplier added', async () => {
  const p = await open()
  await tab(p, 'Purchases')
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('gupta.pdf', PUR))
  await p.locator('.pdfnote.ok', { hasText: 'PUR-0005, PUR-0006' }).waitFor()
  const all = await purs(p)
  assert.equal(all.length, 6)
  assert.deepEqual(all.slice(4).map((x) => x.lines[0].item), ['cu', 'br'])
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].tx.length), 7) // no payments
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('booksmith10')).biz[0].sup.some((s) => s.name === 'Gupta Metals Pvt Ltd')))
})

test('PDF import purchases, auto off: queue loads item 2 of 2 after recording item 1; Rate includes GST', async () => {
  const p = await open()
  await tab(p, 'Purchases')
  await p.uncheck('.chk input')
  await p.setInputFiles('[data-testid=pdf-input]', pdfFile('gupta.pdf', PUR))
  await p.locator('.pdfnote', { hasText: 'Item 1 of 2' }).waitFor()
  assert.equal(await p.inputValue('label:has-text("Date") input'), '2026-10-02')
  assert.equal(await p.inputValue('.lrow input >> nth=0'), '100')
  await p.selectOption('label:has-text("Rate includes") select', 'incl')
  await p.click('button:has-text("Record purchase")')
  await p.locator('.pdfnote', { hasText: 'item 2 of 2' }).waitFor()
  assert.equal(await p.inputValue('.lrow input >> nth=0'), '500')
  assert.equal(await p.locator('.newparty').count(), 0) // supplier was created with the first record
  await p.click('button:has-text("Record purchase")')
  const all = await purs(p)
  assert.equal(all.length, 6)
  assert.equal(all[4].lines[0].rate, Math.round((1500 / 1.18) * 10000) / 10000)
  assert.equal(all[5].sup, all[4].sup)
  assert.equal(await p.locator('.pdfnote').count(), 0)
})
