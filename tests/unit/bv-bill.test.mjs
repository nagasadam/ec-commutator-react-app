// A photographed purchase bill from B.V. Industrial Solutions (tests/fixtures/bv-industrial-bill.txt: its text as read, line by line).
// It broke four things: the seller's GSTIN is the very first line (the name comes under it), the date has a two-digit year,
// it prints CGST, SGST and IGST labels but fills in only CGST and SGST, and the item name has a size in it ("3 mm").
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDocument, buildDraft, autoSaveIssues, findDate } from '../../src/lib/pdfimport.js'
import { demoBiz } from '../../src/lib/seed.js'

const lines = readFileSync(new URL('../fixtures/bv-industrial-bill.txt', import.meta.url), 'utf8').split('\n')

test('B.V. bill: supplier name, GSTIN and phone are read although the GSTIN comes first', () => {
  const p = parseDocument(lines, 'purchase').party
  assert.equal(p.name, 'B.V.INDUSTRIAL SOLUTIONS')
  assert.equal(p.gstin, '36AAYFB1653J1Z0')
  assert.equal(p.phone, '8919114020')
  assert.equal(p.company, true)
  assert.match(p.address, /^3-4-123\/38/) // "Address :" is not part of the address
  assert.doesNotMatch(p.address, /V4 INDUSTRIES|36AALFV9329A1ZZ/) // the buyer is not the supplier
})

test('B.V. bill: the invoice date is 10-10-26, not the vehicle date', () => {
  assert.equal(parseDocument(lines, 'purchase').date, '2026-10-10')
})

test('B.V. bill: CGST + SGST amounts with an empty IGST label is an intra-state bill', () => {
  assert.equal(parseDocument(lines, 'purchase').supply, 'intra')
})

test('B.V. bill: the item keeps its size words and its HSN', () => {
  const r = parseDocument(lines, 'purchase').rows
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], { desc: 'fiberglass 3 mm chapped strand', hsn: '7019', qty: 500, rate: 120, taxable: 60000 })
})

test('B.V. bill: the draft carries a new supplier and says the item is not in the list', () => {
  const b = demoBiz()
  const d = buildDraft(b, parseDocument(lines, 'purchase'), 'purchase')
  assert.equal(d.party, '__new__')
  assert.equal(d.newParty.gstin, '36AAYFB1653J1Z0')
  assert.equal(d.date, '2026-10-10')
  assert.equal(d.supply, 'intra')
  assert.ok(autoSaveIssues(b, d).some((m) => /did not match/.test(m)))
})

test('same bill when the reader puts the description and the numbers on two lines', () => {
  const alt = lines.flatMap((l) => (l.startsWith('1 fiberglass') ? ['1 fiberglass 3 mm chapped strand', '7019 500 120/kg 60000.00'] : [l]))
  const r = parseDocument(alt, 'purchase').rows[0]
  assert.deepEqual([r.hsn, r.qty, r.rate, r.taxable], ['7019', 500, 120, 60000])
  assert.match(r.desc, /fiberglass/)
})

test('two-digit years: day-month-yy is read, a four-digit year and a date with no year are not mixed up', () => {
  assert.equal(findDate('Date:10-10-26'), '2026-10-10')
  assert.equal(findDate('Dated 5/9/26'), '2026-09-05')
  assert.equal(findDate('Date:17-2-2026'), '2026-02-17')
  assert.equal(findDate('5-Jun-26'), '2026-06-05')
  assert.equal(findDate('GSTIN 36AAYFB1653J1Z0 No 4034261148026'), '')
})

test('tax labels: a rate alone does not decide, amounts do; both IGST and CGST/SGST labels with no amounts fall back to the old rule', () => {
  const cg = ['Total 60000.00', 'CGST@ 5400.00', 'SGST@ 5400.00', 'IGST @ 18%']
  assert.equal(parseDocument(cg, 'purchase').supply, 'intra')
  const ig = ['Total 60000.00', 'CGST@ 9%', 'SGST@ 9%', 'IGST @ 18% 10800.00']
  assert.equal(parseDocument(ig, 'purchase').supply, 'inter')
  assert.equal(parseDocument(['CGST', 'SGST', 'IGST'], 'purchase').supply, 'inter') // labels only: unchanged
})

test('a rating such as 750 W stays with the item name and an industrial estate is not a supplier name', () => {
  const r = parseDocument(['Sl Description HSN Qty Rate Amount', '1 Commutator 750 W 8538 100 50.00 5000.00', 'Total'], 'sale').rows[0]
  assert.equal(r.desc, 'Commutator 750 W')
  assert.deepEqual([r.qty, r.rate, r.taxable], [100, 50, 5000])
  const p = parseDocument(['TAX INVOICE', 'Sterling Copper Pvt Ltd', '12 Industrial Estate, Hosur', 'GSTIN: 33AAACS9999D1Z1'], 'purchase').party
  assert.equal(p.name, 'Sterling Copper Pvt Ltd')
})

// A second photographed bill: Romit Resins, interstate (IGST 18 %, CGST and SGST printed as 0.00 %), HSN printed under the item row.
test('Romit Resins bill: supplier, date, IGST, item row, HSN under the row, transporter', () => {
  const rl = readFileSync(new URL('../fixtures/romit-resins-bill.txt', import.meta.url), 'utf8').split('\n')
  const p = parseDocument(rl, 'purchase')
  assert.equal(p.party.name, 'ROMIT RESINS PRIVATE LIMITED')
  assert.equal(p.party.gstin, '27AAACR0394K1Z7')
  assert.doesNotMatch(p.party.address, /mail/i)
  assert.equal(p.date, '2026-10-23') // the invoice date, not the due date or the preparation date
  assert.equal(p.supply, 'inter')
  assert.equal(p.transporter, 'VRL')
  assert.deepEqual(p.rows, [{ desc: 'P.F.Resin Moulding Compound', hsn: '39094020', qty: 400, rate: 95, taxable: 38000 }])
})
