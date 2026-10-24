import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDocument, buildDraft, autoSaveIssues, addInvoice, addPurchases, findDate, matchItem, matchParty, extractLines, itemsToLines, exclGst,
  gstinCheck, findGstin, importFile,
} from '../../src/lib/pdfimport.js'
import { ocrToLines } from '../../src/lib/ocr.js'
import { buildPdf } from '../../src/lib/pdf.js'
import { calc } from '../../src/lib/calc.js'
import { demoBiz } from '../../src/lib/seed.js'
import { mkBiz } from '../../src/lib/model.js'

// The Ashok invoice from the spec, as the text lines PDF.js would give.
const ASHOK = [
  'TAX INVOICE',
  'Original for Recipient',
  'E.C COMMUTATORS',
  'GSTIN: 33AAACE1111A1Z5',
  'Invoice No: 66 Invoice Date: 17.10.2024',
  'Date of Supply: 18.10.2024',
  'To,(BUYER BILLED ADDRESS)',
  'ASHOK ENGINEERING WORKS',
  '1/424/66-A, SHAHDRA FLYOVER,',
  'SHAHDRA, NEW DELHI -110032',
  'GSTIN: 07AAKPB7527M1ZF Ph No: 9810209580',
  'Name of transport: V R L logistics Ltd',
  'Mode of transport: Road',
  'LR No: 77881 Dt 18.10.2024',
  'Sl Description HSN Qty Rate Amount',
  '1 COMMUTATOR 85030090 1000 Nos 25.00 25,000.00',
  '2 COMMUTATOR 85030090 1000 Nos 18.50 18,500.00',
  'Total 43,500.00',
  'IGST 18% 7,830.00',
  'Grand Total 51,330.00',
]

test('spec example: every field of the Ashok invoice', () => {
  const p = parseDocument(ASHOK, 'sale')
  assert.equal(p.party.name, 'ASHOK ENGINEERING WORKS')
  assert.equal(p.party.gstin, '07AAKPB7527M1ZF')
  assert.equal(p.party.phone, '9810209580')
  assert.equal(p.party.address, '1/424/66-A, SHAHDRA FLYOVER,, SHAHDRA, NEW DELHI -110032'.replace(',,', ','))
  assert.equal(p.party.company, true)
  assert.equal(p.date, '2024-10-17') // invoice date, not date of supply
  assert.equal(p.supply, 'inter')
  assert.equal(p.transporter, 'V R L logistics Ltd') // mode of transport ignored
  assert.equal(p.lr, '77881')
  assert.equal(p.lrDate, '2024-10-18')
  assert.deepEqual(p.rows.map((r) => [r.qty, r.rate]), [[1000, 25], [1000, 18.5]])
  assert.equal(p.rows[0].desc, 'COMMUTATOR')
})

test('dates: every format in the spec', () => {
  assert.equal(findDate('17.10.2024'), '2024-10-17')
  assert.equal(findDate('17/10/2024'), '2024-10-17')
  assert.equal(findDate('2024-10-17'), '2024-10-17')
  assert.equal(findDate('17 Oct 2024'), '2024-10-17')
  assert.equal(findDate('5-Jan-2025'), '2025-01-05')
  assert.equal(findDate('31/13/2024'), '')
  assert.equal(findDate('no date'), '')
})

test('quantity x rate = taxable picks the right numbers even with HSN, serial and GST columns', () => {
  const p = parseDocument(['To', 'X Co', 'Sl Description HSN Qty Rate Taxable CGST SGST', '1 Brass insert 74199990 3000 Pcs 2.50 7500.00 9% 675.00 9% 675.00', 'Total'], 'sale')
  assert.deepEqual([p.rows[0].qty, p.rows[0].rate, p.rows[0].taxable], [3000, 2.5, 7500])
  assert.equal(p.supply, 'intra')
})

test('rows without a consistent triple keep what can be read; missing values stay null', () => {
  const p = parseDocument(['To', 'X Co', 'Description Qty', 'Mystery item 500 Nos', 'Another thing 12 99 7', 'Total'], 'sale')
  assert.equal(p.rows[0].qty, 500)
  assert.equal(p.rows[0].rate, null)
})

test('wrapped description joins with the numbers line', () => {
  const p = parseDocument(['To', 'X Co', 'Sl Description Qty Rate Amount', 'Commutator for armature', '1 type A 100 Nos 10.00 1000.00', 'Total'], 'sale')
  assert.equal(p.rows.length, 1)
  assert.equal(p.rows[0].qty, 100)
})

test('labels: Bill To, Buyer:, M/s with the name on the same line', () => {
  assert.equal(parseDocument(['Bill To', 'ABC Traders', 'GSTIN 29AABCS5678C1Z2'], 'sale').party.name, 'ABC Traders')
  const b = parseDocument(['Buyer: PQR Motors Pvt Ltd', 'Chennai 600001', 'GSTIN: 33AAACP1111A1Z5'], 'sale').party
  assert.equal(b.name, 'PQR Motors Pvt Ltd')
  assert.equal(b.gstin, '33AAACP1111A1Z5')
  assert.equal(parseDocument(['M/s Rama & Sons', 'Madurai'], 'sale').party.name, 'Rama & Sons')
})

test('person without GSTIN is guessed as a person; firm words make a firm', () => {
  assert.equal(parseDocument(['Bill To', 'Ramesh Pillai', 'Chennai'], 'sale').party.company, false)
  assert.equal(parseDocument(['Bill To', 'Kumar Traders', 'Chennai'], 'sale').party.company, true)
})

test('purchase: supplier is the seller at the top, titles skipped; no label needed', () => {
  const p = parseDocument(
    ['TAX INVOICE', 'ORIGINAL COPY', 'Sterling Copper Pvt Ltd', '12 Industrial Estate, Hosur', 'GSTIN: 33AAACS9999D1Z1 Ph: 04312 345678', 'Invoice Date: 02/09/2026', 'Date of Supply: 05/09/2026', 'Bill To', 'E.C Commutators', 'Sl Description HSN Qty Rate Amount', '1 Copper coil 7408 200 Kg 1450.00 290000.00', 'Total'],
    'purchase',
  )
  assert.equal(p.party.name, 'Sterling Copper Pvt Ltd')
  assert.equal(p.party.gstin, '33AAACS9999D1Z1')
  assert.equal(p.date, '2026-09-02')
  assert.deepEqual([p.rows[0].qty, p.rows[0].rate], [200, 1450])
})

test('purchase with From: label', () => {
  const p = parseDocument(['From: Kumar Mica Traders', 'Salem', 'Invoice Date 03-09-2026'], 'purchase')
  assert.equal(p.party.name, 'Kumar Mica Traders')
  assert.equal(p.date, '2026-09-03')
})

test('no date found => dateFound false (so no auto-save)', () => {
  const b = demoBiz()
  const d = buildDraft(b, parseDocument(['To', 'Apex Motors Pvt Ltd', 'Description Qty Rate', '1 Commutator 10 Nos 95.00 950.00', 'Total'], 'sale'), 'sale')
  assert.equal(d.dateFound, false)
  assert.ok(autoSaveIssues(b, d).includes('No date was found.'))
})

test('matching: customer by GSTIN first, then by name; items by name', () => {
  const b = demoBiz()
  assert.equal(matchParty(b.cust, { name: 'Different spelling', gstin: '33aaaca1234b1z5' }).id, 'apex')
  assert.equal(matchParty(b.cust, { name: 'APEX MOTORS PRIVATE LIMITED', gstin: '' }).id, 'apex')
  assert.equal(matchParty(b.cust, { name: 'Nobody', gstin: '' }), null)
  assert.equal(matchItem(b.items, 'COMMUTATORS - type A').id, 'cm')
  assert.equal(matchItem(b.items, 'Copper coil 99%').id, 'cu')
  assert.equal(matchItem(b.items, 'Widget'), null)
  assert.equal(matchItem(b.items, 'xyz', '85030090').id, 'cm') // HSN fallback
})

test('draft: existing customer is selected untouched; new one gets a prefilled box', () => {
  const b = demoBiz()
  const known = buildDraft(b, parseDocument(['To', 'Apex Motors Pvt Ltd', 'GSTIN 33AAACA1234B1Z5', 'Invoice Date 01.10.2026', 'Description Qty Rate Amount', '1 Commutator 10 Nos 95.00 950.00', 'Total'], 'sale'), 'sale')
  assert.equal(known.party, 'apex')
  assert.equal(known.newParty, null)
  const fresh = buildDraft(b, parseDocument(ASHOK, 'sale'), 'sale')
  assert.equal(fresh.party, '__new__')
  assert.equal(fresh.newParty.gstin, '07AAKPB7527M1ZF')
  assert.equal(fresh.rows[0].item, 'cm')
})

test('firm-based business forces new parties to be firms', () => {
  const b = mkBiz('f', 'firm')
  const d = buildDraft(b, parseDocument(['To', 'Ramesh Pillai', 'Invoice Date 01.10.2026', 'Description Qty Rate Amount', '1 Commutator 1 Nos 95.00 95.00'], 'sale'), 'sale')
  assert.equal(d.newParty.company, true)
  assert.ok(autoSaveIssues(b, d).some((w) => /GSTIN/.test(w)))
})

// ---- automatic saving rules (spec: "It stops when ...") ----
const good = (b) => buildDraft(b, parseDocument(['To', 'Apex Motors Pvt Ltd', 'GSTIN 33AAACA1234B1Z5', 'Invoice Date 01.10.2026', 'Description Qty Rate Amount', '1 Commutator 10 Nos 95.00 950.00', 'Total'], 'sale'), 'sale')

test('auto-save: complete data passes', () => {
  assert.deepEqual(autoSaveIssues(demoBiz(), good(demoBiz())), [])
})
test('auto-save stops: no customer', () => {
  const b = demoBiz()
  const d = good(b)
  d.party = ''
  assert.ok(autoSaveIssues(b, d).includes('No customer was found.'))
})
test('auto-save stops: new firm without GSTIN', () => {
  const b = demoBiz()
  const d = good(b)
  d.party = '__new__'
  d.newParty = { name: 'New Co', gstin: '', company: true }
  assert.ok(autoSaveIssues(b, d).some((w) => /no GSTIN/.test(w)))
})
test('auto-save stops: no rows, unmatched item, missing qty/rate', () => {
  const b = demoBiz()
  let d = good(b)
  d.rows = []
  assert.ok(autoSaveIssues(b, d).includes('No item rows were found.'))
  d = good(b)
  d.rows[0].item = ''
  assert.ok(autoSaveIssues(b, d).some((w) => /did not match a product/.test(w)))
  d = good(b)
  d.rows[0].rate = null
  assert.ok(autoSaveIssues(b, d).some((w) => /missing a quantity or rate/.test(w)))
})
test('auto-save stops: duplicate invoice (same PDF twice)', () => {
  const b = demoBiz()
  const d = good(b)
  assert.deepEqual(autoSaveIssues(b, d), [])
  addInvoice(b, { ...d, party: d.party, lines: d.rows.map((r) => ({ item: r.item, qty: r.qty, rate: r.rate })) })
  assert.ok(autoSaveIssues(b, d).some((w) => /identical invoice/.test(w)))
})
test('auto-save stops: not enough stock', () => {
  const b = demoBiz()
  const d = good(b)
  d.rows[0].qty = 999999
  d.rows[0].rate = 1
  assert.ok(autoSaveIssues(b, d).some((w) => /Not enough stock/.test(w)))
})

test('addInvoice adds the new customer first, numbers INV for firms, keeps transporter, GST type follows GSTIN', () => {
  const b = demoBiz()
  const d = buildDraft(b, parseDocument(ASHOK.map((l) => l.replace('Original for Recipient', '')), 'sale'), 'sale')
  const before = b.cust.length
  const inv = addInvoice(b, { ...d, lines: d.rows.map((r) => ({ item: r.item, qty: r.qty, rate: r.rate })) })
  assert.equal(b.cust.length, before + 1)
  assert.equal(inv.no, 'INV-0004')
  assert.equal(inv.transporter, 'V R L logistics Ltd')
  const cust = b.cust.at(-1)
  assert.deepEqual([cust.phone, cust.gstin.slice(0, 2)], ['9810209580', '07'])
  assert.equal(calc(b).gstOut > 0, true)
})

test('addPurchases: one purchase per row, Pay later (no payment recorded), existing supplier untouched', () => {
  const b = demoBiz()
  const txBefore = b.tx.length
  const sup = JSON.stringify(b.sup[0])
  const made = addPurchases(b, { party: b.sup[0].id, date: '2026-10-01' }, [{ item: 'cu', qty: 5, rate: 100 }, { item: 'mi', qty: 2, rate: 400 }])
  assert.deepEqual(made.map((p) => p.no), ['PUR-0005', 'PUR-0006'])
  assert.equal(b.tx.length, txBefore)
  assert.equal(JSON.stringify(b.sup[0]), sup)
})

test('rate including GST is converted for firms only', () => {
  assert.equal(exclGst(118, true), 100)
  assert.equal(exclGst(118, false), 118)
})

test('itemsToLines groups by baseline and orders left to right', () => {
  const it = (s, x, y, w = 20) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: w })
  assert.deepEqual(itemsToLines([it('World', 50, 700), it('Hello', 10, 700), it('Next', 10, 650), it('  ', 5, 600)]), ['Hello World', 'Next'])
})

// ---- the real thing: build a PDF, read it back with PDF.js, parse it ----
const pdfjs = await import(new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs', import.meta.url).href).catch(() => null)
const asFile = (u8) => ({ size: u8.length, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) })

test('end to end through PDF.js: Ashok PDF -> filled draft', { skip: !pdfjs && 'pdfjs-dist not installed' }, async () => {
  const pdf = buildPdf({ title: 'TAX INVOICE', blocks: ASHOK.slice(1).map((p) => ({ p })) })
  const lines = await extractLines(asFile(pdf), pdfjs)
  const d = buildDraft(demoBiz(), parseDocument(lines, 'sale'), 'sale')
  assert.equal(d.newParty.name, 'ASHOK ENGINEERING WORKS')
  assert.equal(d.date, '2024-10-17')
  assert.deepEqual(d.rows.map((r) => [r.item, r.qty, r.rate]), [['cm', 1000, 25], ['cm', 1000, 18.5]])
})

test('limits: scan-like PDF, oversize file, non-PDF', { skip: !pdfjs && 'pdfjs-dist not installed' }, async () => {
  const empty = buildDraftless()
  await assert.rejects(extractLines(asFile(empty), pdfjs, { ocr: false }), { code: 'no-text' })
  await assert.rejects(extractLines({ size: 11 * 1024 * 1024 }, pdfjs), { code: 'too-big' })
  await assert.rejects(extractLines(asFile(new TextEncoder().encode('hello world, not a pdf')), pdfjs), { code: 'not-pdf' })
  function buildDraftless() {
    return buildPdf({ title: '', blocks: [] })
  }
})

test('only the first 5 pages are read', { skip: !pdfjs && 'pdfjs-dist not installed' }, async () => {
  const blocks = []
  for (let i = 0; i < 400; i++) blocks.push({ p: `Line number ${i} of a very long document ${i}` })
  const lines = await extractLines(asFile(buildPdf({ title: 'Long', blocks })), pdfjs)
  assert.ok(lines.length < 400)
  assert.ok(lines.length > 100)
})

test('delivery-address note is never part of the customer (own line, label line, or same line)', () => {
  const tail = ['Sl Description HSN Qty Rate Amount', '1 COMMUTATOR 85030090 10 Nos 25.00 250.00', 'Total']
  const base = ['To,(BUYER BILLED ADDRESS)', 'ASHOK ENGINEERING WORKS', '1/424/66-A, SHAHDRA FLYOVER,', 'SHAHDRA, NEW DELHI -110032', 'GSTIN: 07AAKPB7527M1ZF Ph No: 9810209580']
  const cases = {
    'own line after': [...base, 'BUYER DELIVERED ADDRESS: Same as in the customer name', ...tail],
    'label then text': [...base, '(BUYER DELIVERED ADDRESS)', 'Same as in the customer name', ...tail],
    'same line as name': ['To,(BUYER BILLED ADDRESS)', 'ASHOK ENGINEERING WORKS BUYER DELIVERED ADDRESS: Same as in the customer name', ...base.slice(2), ...tail],
    'before the buyer block': ['BUYER DELIVERED ADDRESS: Same as in the customer name', ...base, ...tail],
  }
  for (const [name, lines] of Object.entries(cases)) {
    const p = parseDocument(lines, 'sale').party
    assert.equal(p.name, 'ASHOK ENGINEERING WORKS', name)
    assert.ok(!/deliver|same as/i.test(p.address), `${name}: address was "${p.address}"`)
    assert.equal(p.address, '1/424/66-A, SHAHDRA FLYOVER, SHAHDRA, NEW DELHI -110032', name)
    assert.equal(p.gstin, '07AAKPB7527M1ZF', name)
  }
})

// ---------------------------------------------------------------- scanned PDFs (OCR)
// Real output of the Tesseract reader on a scanned Tally-style purchase invoice (trimmed; the
// "|" and "{" marks are table borders the reader mistook for letters, and the seller's GSTIN is
// garbled: the real one is 20AABCM1411F1ZG).
const SCAN = `
Tax Invoice e-Invoice
IRN : 2201 bc2b9f3155acc9c0dfacb2885ed42c1eec29c8ba-
Ack No. : 142620501845154
Ack Date : 5-Jun-26
(Cwpmica
M.P.MICA ENTERPRISES PVT. LTD.
BHUDOLIA BHAWAN, KUTIA ROAD
GIRIDIH-815301 JHARKHAND)
Jharkhand - 815301, India
UDYAM : UDYAM-JH-08-0000449 (Small)
GSTIN/UIN: Z2OAABCM1411F12Z2G
State Name : Jharkhand, Code : 20
CIN: U14293JH1988PTCO003170
Contact : O6532-250977,221211
E-Mail : accounts@mpmica.com
Consignee (Ship to)
V4 INDUSTRIES
Plot No 35,36, Survey No 53 & 54, Bahadurpally,
Telangana - 500055, India
GSTIN/UIN : 36AALFV9329A1ZZ
Invoice No. e-Way Bill No. | Dated
103/26-27 431733958144 | 5-Jun-26
Buyer's Order No. Dated
PI/V4/015/2627 27-May-26
Dispatched through
Blue Dart Express Ltd.
Bill of Lading/LR-RR No.
51944717694 dt. 5-Jun-26
Buyer (Bill to)
V4 INDUSTRIES
GSTIN/UIN : 36AALFV9329A1ZZ
SI] No. & Kind Description of Goods HSN/SAC | GST | Quantity Rate per Amount
No.| of Pkgs. Rate
1| 05 CTNS | Mica Rifted Into Sheets (681410) |68141090 | 18 %| 246.000 KG 400.00) KG 98,400.00
Size : 1000 X 600 X 0.55 MM, Epoxy
IGST 17,712.00
Total 246.000 KG 1,16,112.00 Rs.
`

test('GSTIN check character, and recovery of a garbled GSTIN', () => {
  for (const g of ['36AALFV9329A1ZZ', '07AAKPB7527M1ZF', '20AABCM1411F1ZG']) assert.equal(gstinCheck(g.slice(0, 14)), g[14])
  assert.equal(findGstin('GSTIN/UIN: Z2OAABCM1411F12Z2G'), '20AABCM1411F1ZG')
  assert.equal(findGstin('GSTIN: 07AAKPB7527M1ZF Ph No: 9810209580'), '07AAKPB7527M1ZF')
  assert.equal(findGstin('GSTIN/UIN: Z2OAABCM1411F12Z2X'), '') // check character disagrees: never invent one
  assert.equal(findGstin('no id here'), '')
})

test('findDate reads two-digit years written with a month name', () => {
  assert.equal(findDate('| 5-Jun-26'), '2026-06-05')
  assert.equal(findDate('17 Oct 2024'), '2024-10-17')
})

test('scanned purchase invoice: seller, date and item are read; the buyer (our own business) is ignored', () => {
  const p = parseDocument(ocrToLines(SCAN), 'purchase')
  assert.equal(p.party.name, 'M.P.MICA ENTERPRISES PVT. LTD.')
  assert.equal(p.party.gstin, '20AABCM1411F1ZG')
  assert.equal(p.party.phone, '06532250977')
  assert.equal(p.party.company, true)
  assert.match(p.party.address, /KUTIA ROAD/)
  assert.doesNotMatch(p.party.address, /26-27|5-Jun|\d{9}/) // nothing from the invoice-number column
  assert.equal(p.date, '2026-06-05')
  assert.equal(p.supply, 'inter')
  assert.equal(p.rows.length, 1) // the "Size : 1000 X 600 X 0.55 MM" note is not an item
  assert.deepEqual([p.rows[0].desc, p.rows[0].qty, p.rows[0].rate, p.rows[0].taxable], ['Mica Rifted Into Sheets', 246, 400, 98400])
  const d = buildDraft(demoBiz(), p, 'purchase')
  assert.equal(d.party, '__new__')
  assert.equal(d.newParty.name, 'M.P.MICA ENTERPRISES PVT. LTD.')
})

test('ocrToLines drops table borders and noise lines', () => {
  assert.deepEqual(ocrToLines('1| 05 CTNS | Mica {x}\n\n  |\n.\nTotal   98,400.00\n'), ['1 05 CTNS Mica x', 'Total 98,400.00'])
})

const fakePdfjs = (pageCount = 1) => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: pageCount, getPage: async (i) => ({ n: i, getTextContent: async () => ({ items: [] }) }) }) }),
})
const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake')

test('extractLines: a PDF with no text layer is read by OCR and reports progress', async () => {
  const seen = []
  const lines = await extractLines(asFile(pdfBytes), fakePdfjs(2), {
    ocrPage: async (page, { onProgress }) => {
      onProgress(0.5)
      return SCAN.split('\n').slice(0, 12).join('\n') + ` page ${page.n}`
    },
    onProgress: (p) => seen.push(`${p.page}/${p.pages}@${p.pct}`),
  })
  assert.equal(lines.ocr, true)
  assert.ok(lines.includes('M.P.MICA ENTERPRISES PVT. LTD.'))
  assert.deepEqual(seen, ['1/2@0', '1/2@0.5', '2/2@0', '2/2@0.5'])
})

test('extractLines: OCR can be switched off, and a scan with no recognisable text says so', async () => {
  await assert.rejects(extractLines(asFile(pdfBytes), fakePdfjs(), { ocr: false }), { code: 'no-text' })
  await assert.rejects(extractLines(asFile(pdfBytes), fakePdfjs(), { ocrPage: async () => '| _ .' }), { code: 'no-text', message: /scan/ })
})

test('extractLines: only the first 3 pages of a scan are OCR-ed', async () => {
  let n = 0
  await extractLines(asFile(pdfBytes), fakePdfjs(9), { ocrPage: async () => (n++, 'Some readable invoice text here') })
  assert.equal(n, 3)
})

test('importFile: a scanned PDF is never saved automatically, even with auto on', async () => {
  const b = demoBiz()
  let updated = false
  // a page whose recognised text is complete enough that a text PDF would be saved straight away
  const text = [
    'Tax Invoice',
    'M.P.MICA ENTERPRISES PVT. LTD.',
    'GSTIN/UIN: 20AABCM1411F1ZG',
    'Invoice No. Dated',
    '103/26-27 5-Jun-26',
    'Sl Description HSN Quantity Rate Amount',
    '1 Mica 68141090 246.000 KG 400.00 KG 98,400.00',
    'IGST 17,712.00',
  ].join('\n')
  const r = await importFile(asFile(pdfBytes), { mode: 'purchase', getB: () => b, updB: () => (updated = true), auto: true, pdfjs: fakePdfjs(), ocrPage: async () => text })
  assert.equal(r.status, 'review')
  assert.equal(updated, false)
  assert.match(r.issues[0], /scanned image/)
  assert.equal(r.draft.newParty.name, 'M.P.MICA ENTERPRISES PVT. LTD.')
  assert.deepEqual(r.draft.rows.map((x) => [x.item, x.qty, x.rate]), [['mi', 246, 400]])
})

test('scanned sale invoice: the buyer (bill to) is the customer, with LR and transporter from the next line', () => {
  const p = parseDocument(ocrToLines(SCAN), 'sale')
  assert.equal(p.party.name, 'V4 INDUSTRIES')
  assert.equal(p.party.gstin, '36AALFV9329A1ZZ')
  assert.equal(p.date, '2026-06-05')
  assert.equal(p.supply, 'inter')
  assert.equal(p.transporter, 'Blue Dart Express Ltd.')
  assert.equal(p.lr, '51944717694')
  assert.equal(p.lrDate, '2026-06-05')
  assert.deepEqual(p.rows.map((r) => [r.desc, r.qty, r.rate]), [['Mica Rifted Into Sheets', 246, 400]])
})

test('sale invoice: buyer wins over a consignee that comes first', () => {
  const lines = ['Consignee (Ship to)', 'SHIP HERE TRADERS', 'GSTIN: 07AAKPB7527M1ZF', 'Buyer (Bill to)', 'BILL ME ENGINEERING', 'GSTIN: 36AALFV9329A1ZZ', 'Sl Description HSN Qty Rate Amount', '1 COMMUTATOR 8503 10 Nos 5.00 50.00']
  assert.equal(parseDocument(lines, 'sale').party.name, 'BILL ME ENGINEERING')
})

test('importFile: a scanned sale invoice fills the draft for review and never saves itself', async () => {
  const b = demoBiz()
  let updated = false
  const r = await importFile(asFile(pdfBytes), { mode: 'sale', getB: () => b, updB: () => (updated = true), auto: true, pdfjs: fakePdfjs(), ocrPage: async () => SCAN })
  assert.equal(r.status, 'review')
  assert.equal(updated, false)
  assert.match(r.issues[0], /scanned image/)
  assert.equal(r.draft.newParty.name, 'V4 INDUSTRIES')
  assert.equal(r.draft.lr, '51944717694')
  assert.equal(r.draft.transporter, 'Blue Dart Express Ltd.')
})
