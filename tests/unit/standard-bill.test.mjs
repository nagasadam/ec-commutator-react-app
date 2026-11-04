import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ocrToLines } from '../../src/lib/ocr.js'
import { parseDocument, buildDraft, importFile } from '../../src/lib/pdfimport.js'

// The company's standard tax invoice (V4 INDUSTRIES -> ASHOK ENGINEERING WORKS, no. 055, 24.10.2026, IGST).
// Each fixture is what text recognition made of the same phone photo under a different reading setup:
// some drop the "Description of goods" heading, the rate or the HSN, put the item name below its numbers,
// or put stray marks in front of the customer name. Every one must come out as the same bill.
const DIR = new URL('../fixtures/standard-bill/', import.meta.url)
const variants = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt'))

const biz = () => ({
  kind: 'firm', inv: [], pur: [], sr: [], prr: [], rej: [], prod: [], tx: [], exp: [],
  cust: [{ id: 'c1', name: 'Ashok Engineering Works', gstin: '07AAKPB7527M1ZF', company: true }],
  items: [{ id: 'cm', name: 'Slot type commutators (Ring Type)', type: 'fg', hsn: '8503' }],
})

test('the standard bill has fixtures', () => assert.ok(variants.length >= 5))

for (const f of variants) {
  test('standard bill: ' + f, () => {
    const text = fs.readFileSync(new URL(f, DIR), 'utf8')
    const p = parseDocument(ocrToLines(text), 'sale')
    // customer block: name, address, GSTIN, phone
    assert.match(p.party.name, /ENGINEERING WORKS$/i)
    assert.equal(p.party.gstin, '07AAKPB7527M1ZF')
    if (text.includes('9810209580')) assert.equal(p.party.phone, '9810209580') // one reading lost the phone number altogether
    assert.match(p.party.address, /SHAHDRA FLYOVER/)
    assert.match(p.party.address, /NEW DELHI/)
    assert.doesNotMatch(p.party.name + p.party.address, /BUYER|DELIVERED/i)
    // header
    assert.equal(p.date, '2026-10-24')
    assert.equal(p.supply, 'inter')
    assert.match(p.transporter, /V R L logistics/i)
    // the one item row: 4000 x 35 = 140000, HSN 8503
    assert.equal(p.rows.length, 1)
    const r = p.rows[0]
    assert.equal(r.qty, 4000)
    assert.equal(r.rate, 35)
    assert.equal(r.taxable, 140000)
    assert.match(r.desc, /commutators/i)
    // matched to the existing customer by GSTIN, and the item by its words / HSN
    const d = buildDraft(biz(), p, 'sale')
    assert.equal(d.party, 'c1')
    assert.equal(d.rows[0].item, 'cm')
  })
}

test('a photo of the standard bill is never saved without review, and fills the form', async () => {
  const u8 = new Uint8Array(100)
  u8.set([0xff, 0xd8, 0xff, 0xe0])
  const file = { size: 100, arrayBuffer: async () => u8.buffer }
  const text = fs.readFileSync(new URL('ocr-gray_6.txt', DIR), 'utf8')
  const r = await importFile(file, { mode: 'sale', getB: biz, updB: () => assert.fail('must not save'), auto: true, ocrImage: async () => text, readQr: async () => null })
  assert.equal(r.status, 'review')
  assert.equal(r.draft.party, 'c1')
  assert.equal(r.draft.rows[0].qty, 4000)
  assert.ok(r.issues.some((x) => /photo of a bill/.test(x)))
})
