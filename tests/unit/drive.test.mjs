import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFolderId, listPdfs, downloadPdf, getToken, forgetToken } from '../../src/lib/drive.js'
import { importFile, markImported } from '../../src/lib/pdfimport.js'
import { buildPdf } from '../../src/lib/pdf.js'
import { demoBiz } from '../../src/lib/seed.js'
import { mkBiz, fixBiz } from '../../src/lib/model.js'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123'

test('folder id from every kind of Drive link, or the bare id', () => {
  assert.equal(parseFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`), ID)
  assert.equal(parseFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`), ID)
  assert.equal(parseFolderId(`https://drive.google.com/open?id=${ID}`), ID)
  assert.equal(parseFolderId(`  ${ID}  `), ID)
  assert.equal(parseFolderId('https://example.com/nothing'), '')
  assert.equal(parseFolderId('short'), '')
  assert.equal(parseFolderId(''), '')
})

const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, arrayBuffer: async () => new TextEncoder().encode('%PDF-x').buffer })

test('listPdfs asks only for non-trashed PDFs in that folder, follows pages, sends the token', async () => {
  const urls = []
  const f = async (url, init) => {
    urls.push([decodeURIComponent(url), init.headers.Authorization])
    return url.includes('pageToken') ? json({ files: [{ id: 'b', name: 'b.pdf', size: '20', modifiedTime: '2026-10-02T10:00:00Z' }] }) : json({ files: [{ id: 'a', name: 'a.pdf', size: '10', modifiedTime: '2026-10-03T10:00:00Z' }], nextPageToken: 'T2' })
  }
  const out = await listPdfs(ID, 'tok', f)
  assert.deepEqual(out.map((x) => [x.id, x.modified, x.size]), [['a', '2026-10-03', 10], ['b', '2026-10-02', 20]])
  assert.equal(urls.length, 2)
  assert.match(urls[0][0], new RegExp(`'${ID}' in parents and mimeType='application/pdf' and trashed=false`))
  assert.equal(urls[0][1], 'Bearer tok')
  assert.match(urls[1][0], /pageToken=T2/)
})

test('listPdfs cannot be broken out of its query by a crafted id', async () => {
  let q
  await listPdfs("x' or name contains 'a", 't', async (u) => ((q = decodeURIComponent(u)), json({ files: [] })))
  assert.ok(!q.includes("x' or"))
})

test('Drive errors become clear messages', async () => {
  const code = (st) => listPdfs(ID, 't', async () => json({}, st)).catch((e) => e.code)
  assert.equal(await code(401), 'expired')
  assert.equal(await code(404), 'not-found')
  assert.equal(await code(403), 'forbidden')
  assert.equal(await code(500), 'drive')
  assert.equal(await listPdfs(ID, 't', async () => { throw new TypeError('x') }).catch((e) => e.code), 'offline')
})

test('downloadPdf returns a File-like object', async () => {
  const f = await downloadPdf({ id: 'a', name: 'x.pdf' }, 'tok', async (u, i) => (assert.match(u, /files\/a\?alt=media/), assert.equal(i.headers.Authorization, 'Bearer tok'), json({})))
  assert.equal(f.name, 'x.pdf')
  assert.equal(new TextDecoder().decode(await f.arrayBuffer()), '%PDF-x')
})

test('getToken reuses an unexpired token and asks again after expiry', async () => {
  forgetToken()
  let calls = 0
  let t = 1000
  const gis = { accounts: { oauth2: { initTokenClient: (c) => ({ requestAccessToken: () => (calls++, c.callback({ access_token: 'T' + calls, expires_in: 3600 })) }) } } }
  assert.equal(await getToken('cid', { gis, now: () => t }), 'T1')
  assert.equal(await getToken('cid', { gis, now: () => t + 1000 }), 'T1')
  assert.equal(calls, 1)
  assert.equal(await getToken('cid', { gis, now: () => t + 3600_000 }), 'T2')
})

test('getToken reports a refusal', async () => {
  forgetToken()
  const gis = { accounts: { oauth2: { initTokenClient: (c) => ({ requestAccessToken: () => c.callback({ error: 'access_denied' }) }) } } }
  await assert.rejects(getToken('cid', { gis }), { code: 'denied' })
})

// ---- importFile + imported-file tracking ----
const pdf = (lines) => {
  const u8 = buildPdf({ title: 'TAX INVOICE', blocks: lines.map((p) => ({ p })) })
  return { size: u8.length, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) }
}
const APEX = ['Bill To', 'Apex Motors Pvt Ltd', 'GSTIN: 33AAACA1234B1Z5', 'Invoice Date: 01.10.2026', 'Sl Description HSN Qty Rate Amount', '1 Commutator 8503 10 Nos 95.00 950.00', 'Total']
const ctl = (b) => ({ getB: () => b, updB: (fn) => fn(b) })
const pdfjs = await import(new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs', import.meta.url).href).catch(() => null)
const skip = !pdfjs && 'pdfjs-dist not installed'

test('importFile: complete PDF is saved and the Drive file is marked in the same change', { skip }, async () => {
  const b = demoBiz()
  const r = await importFile(pdf(APEX), { mode: 'sale', ...ctl(b), auto: true, mark: { id: 'F1', name: 'a.pdf' }, pdfjs })
  assert.equal(r.status, 'saved')
  assert.equal(b.inv.length, 5)
  assert.deepEqual(b.dimp.map((m) => [m.id, m.kind, m.ref]), [['F1', 'sale', 'INV-0004']])
})

test('importFile: the same PDF as a second Drive file is blocked as a duplicate and not marked', { skip }, async () => {
  const b = demoBiz()
  await importFile(pdf(APEX), { mode: 'sale', ...ctl(b), auto: true, mark: { id: 'F1', name: 'a.pdf' }, pdfjs })
  const r = await importFile(pdf(APEX), { mode: 'sale', ...ctl(b), auto: true, mark: { id: 'F2', name: 'copy.pdf' }, pdfjs })
  assert.equal(r.status, 'review')
  assert.match(r.issues.join(' '), /identical invoice/)
  assert.equal(b.inv.length, 5)
  assert.equal(b.dimp.length, 1)
})

test('importFile: auto off never saves', { skip }, async () => {
  const b = demoBiz()
  const r = await importFile(pdf(APEX), { mode: 'sale', ...ctl(b), auto: false, pdfjs })
  assert.equal(r.status, 'review')
  assert.equal(b.inv.length, 4)
})

test('markImported is idempotent', () => {
  const b = demoBiz()
  fixBiz(b)
  markImported(b, { id: 'F', name: 'n' }, 'sale', 'X')
  markImported(b, { id: 'F', name: 'n' }, 'sale', 'X')
  assert.equal(b.dimp.length, 1)
})

test('businesses carry per-kind Drive folders; old data is migrated', () => {
  assert.deepEqual(mkBiz('x').drive, { sale: '', purchase: '' })
  const old = { id: 'a', name: 'o' }
  fixBiz(old)
  assert.deepEqual([old.drive, old.dimp], [{ sale: '', purchase: '' }, []])
  const half = { id: 'b', name: 'h', drive: { sale: 'S' } }
  fixBiz(half)
  assert.deepEqual(half.drive, { sale: 'S', purchase: '' })
})
