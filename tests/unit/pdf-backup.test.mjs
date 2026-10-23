import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPdf, statementPdf, rs } from '../../src/lib/pdf.js'
import { exportJson, parseBackup, mergeBackup } from '../../src/lib/backup.js'
import { ledger } from '../../src/lib/reports.js'
import { demoBiz } from '../../src/lib/seed.js'
import { mkBiz } from '../../src/lib/model.js'

const text = (u8) => new TextDecoder().decode(u8)

test('pdf is structurally valid: header, xref offsets, EOF', () => {
  const s = text(statementPdf(demoBiz(), demoBiz().cust[0], 'cust', ledger(demoBiz(), demoBiz().cust[0], 'cust')))
  assert.ok(s.startsWith('%PDF-1.4'))
  assert.ok(s.trimEnd().endsWith('%%EOF'))
  const xref = +s.match(/startxref\n(\d+)/)[1]
  assert.equal(s.slice(xref, xref + 4), 'xref')
  const n = +s.match(/xref\n0 (\d+)/)[1]
  const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1])
  assert.equal(offs.length, n - 1)
  offs.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`))
})

test('pdf escapes parentheses and non-ASCII, paginates long tables', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`2026-01-${i}`, 'R', 'a (b) \\ ₹ é', '1', '2', '3'])
  const s = text(buildPdf({ title: 'T (x)', blocks: [{ table: { cols: ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => ({ t, w: 1 })), rows } }] }))
  assert.match(s, /\\\(x\\\)/)
  assert.ok(!/[^\x00-\x7f]/.test(s))
  assert.ok(+s.match(/\/Count (\d+)/)[1] >= 3)
})

test('rs formats Indian grouping', () => assert.equal(rs(1234567.5), 'Rs. 12,34,567.50'))

test('backup round-trips', () => {
  const S = { biz: [demoBiz()], cur: 'x' }
  const r = parseBackup(exportJson(S))
  assert.equal(r.S.biz[0].inv.length, 4)
  assert.equal(r.S.cur, S.biz[0].id)
})

test('backup rejects bad input without throwing', () => {
  assert.match(parseBackup('nope').error, /JSON/)
  assert.match(parseBackup('{}').error, /No businesses/)
  assert.match(parseBackup(JSON.stringify({ biz: [{ id: 1, name: 'x' }] })).error, /malformed/)
  assert.match(parseBackup(JSON.stringify({ biz: [{ id: 'a', name: 'x', inv: 5 }] })).error, /inv must be a list/)
})

test('old backups are migrated (missing arrays and kind added)', () => {
  const r = parseBackup(JSON.stringify({ biz: [{ id: 'a', name: 'x' }] }))
  assert.deepEqual(r.S.biz[0].pp, [])
  assert.equal(r.S.biz[0].kind, 'person')
})

test('merge import never overwrites an existing business id', () => {
  const b = mkBiz('A')
  const S = { biz: [b], cur: b.id }
  const m = mergeBackup(S, { biz: [{ ...b }] }, () => 'new1')
  assert.equal(m.biz.length, 2)
  assert.equal(m.biz[1].id, 'new1')
  assert.match(m.biz[1].name, /imported/)
  assert.equal(m.biz[0].name, 'A')
})
