import test from 'node:test'
import assert from 'node:assert/strict'
import { extractLines, applyQr, importFile, gstinCheck } from '../../src/lib/pdfimport.js'
import { parseEInvoiceQr } from '../../src/lib/qr.js'

const jpeg = (n = 100) => {
  const u8 = new Uint8Array(n)
  u8.set([0xff, 0xd8, 0xff, 0xe0])
  return { size: n, arrayBuffer: async () => u8.buffer }
}
const mkG = (g14) => g14 + gstinCheck(g14)
const GST = mkG('27AABCU9603R1Z')
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (data) => ['x', b64u({ data: JSON.stringify(data), iss: 'NIC' }), 'sig'].join('.')

const TEXT = ['TAX INVOICE', 'Gupta Metals Pvt Ltd', 'Invoice No: GM/22', 'Invoice Date: 03/04/2025', 'Copper wire 7408 10 Kg 500.00 5000.00']

test('a photo is read with text recognition and flagged as such', async () => {
  const seen = []
  const lines = await extractLines(jpeg(), null, { ocrImage: async () => TEXT.join('\n'), onProgress: (p) => seen.push(p.pages) })
  assert.equal(lines.ocr, true)
  assert.equal(lines.photo, true)
  assert.ok(lines.length >= 4)
  assert.deepEqual(seen.at(-1), 1)
})

test('a photo with no readable text says what to do', async () => {
  await assert.rejects(extractLines(jpeg(), null, { ocrImage: async () => '  \n ' }), (e) => e.code === 'no-text' && /good light/.test(e.message))
})

test('a file over 25 MB is refused; a plain-text file is still "not a PDF"', async () => {
  await assert.rejects(extractLines({ size: 26 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) }, null, {}), (e) => e.code === 'too-big')
  const t = new TextEncoder().encode('plain text')
  await assert.rejects(extractLines({ size: t.length, arrayBuffer: async () => t.buffer }, null, {}), (e) => e.code === 'not-pdf')
})

test('e-invoice QR: signed token and plain JSON are both read; other QR codes are ignored', () => {
  const d = { SellerGstin: GST, BuyerGstin: GST, DocNo: 'GM/22', DocDt: '03/04/2025', TotInvVal: 5900, Irn: 'abc' }
  for (const raw of [token(d), JSON.stringify({ data: d }), JSON.stringify(d)]) {
    const q = parseEInvoiceQr(raw)
    assert.equal(q.sellerGstin, GST)
    assert.equal(q.docNo, 'GM/22')
    assert.equal(q.date, '2025-04-03')
    assert.equal(q.total, 5900)
  }
  assert.equal(parseEInvoiceQr('upi://pay?pa=a@b'), null)
  assert.equal(parseEInvoiceQr('a.b.c'), null)
  assert.equal(parseEInvoiceQr(''), null)
})

test('applyQr: valid GSTIN and date replace what text recognition made of them; a bad GSTIN is not used', () => {
  const p = { party: { name: 'Gupta', gstin: 'Z2OAABCU9603R1Z5', phone: '', address: '', company: true }, date: '2025-04-08' }
  const note = applyQr(p, { sellerGstin: GST, buyerGstin: '', docNo: 'GM/22', date: '2025-04-03', total: 5900 }, 'purchase')
  assert.equal(p.party.gstin, GST)
  assert.equal(p.date, '2025-04-03')
  assert.match(note, /supplier GSTIN and invoice date/)
  const p2 = { party: { name: 'Gupta', gstin: '', phone: '', address: '', company: true }, date: '' }
  assert.equal(applyQr(p2, { sellerGstin: '27AABCU9603R1ZX', date: '', docNo: '1' }, 'purchase'), '')
  assert.equal(p2.party.gstin, '')
  assert.equal(applyQr(p2, null, 'purchase'), '')
  const p3 = { party: null, date: '' }
  applyQr(p3, { sellerGstin: GST, date: '', docNo: '9' }, 'purchase')
  assert.equal(p3.party.gstin, GST)
})

test('importFile: a photo is never saved automatically and uses the QR when there is one', async () => {
  const b = { kind: 'firm', cust: [], sup: [], items: [{ id: 'r1', name: 'Copper wire', type: 'raw', hsn: '7408' }], inv: [], pur: [], tx: [], sr: [], prr: [], banks: [], pp: [] }
  const r = await importFile(jpeg(), {
    mode: 'purchase', getB: () => b, updB: () => assert.fail('must not save'), auto: true,
    ocrImage: async () => TEXT.join('\n'),
    readQr: async () => ({ sellerGstin: GST, buyerGstin: '', docNo: 'GM/22', date: '2025-04-03', total: 5900 }),
  })
  assert.equal(r.status, 'review')
  assert.equal(r.draft.date, '2025-04-03')
  assert.equal(r.draft.newParty.gstin, GST)
  assert.ok(r.issues.some((i) => /photo of a bill/.test(i)))
  assert.ok(r.issues.some((i) => /QR code/.test(i)))
})

test('a 12 MB photo is accepted (only PDFs are limited to 10 MB); a 12 MB non-photo is refused without being read', async () => {
  const big = new Uint8Array(12 * 1024 * 1024)
  big.set([0xff, 0xd8, 0xff, 0xe0])
  const photo = { size: big.length, slice: (a, b) => ({ arrayBuffer: async () => big.slice(a, b).buffer }), arrayBuffer: async () => big.buffer }
  const lines = await extractLines(photo, null, { ocrImage: async () => TEXT.join('\n') })
  assert.equal(lines.photo, true)
  const notPhoto = new Uint8Array(12 * 1024 * 1024)
  const file = { size: notPhoto.length, slice: (a, b) => ({ arrayBuffer: async () => notPhoto.slice(a, b).buffer }), arrayBuffer: async () => assert.fail('must not read the whole file') }
  await assert.rejects(extractLines(file, null, {}), (e) => e.code === 'too-big' && /10 MB/.test(e.message))
})
