import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkBiz } from '../../src/lib/model.js'
import { valuation } from '../../src/lib/calc.js'
import { ensureProcessItems, applyScan, previewScan, openLots, qrText, parseQr, bizTag } from '../../src/lib/process.js'

const biz = () => {
  const b = mkBiz ? mkBiz('t') : null
  ensureProcessItems(b)
  // plenty of raw stock at a known cost
  for (const [id, q, c] of [['cu', 1000, 100], ['mi', 100, 50], ['mo', 500, 20], ['pb', 5000, 2]]) {
    const i = b.items.find((x) => x.id === id)
    if (i) { i.open = q; i.openCost = c }
  }
  return b
}
const sc = (o) => ({ id: Math.random().toString(36).slice(2), date: '2026-11-05', ...o })

test('ensureProcessItems is idempotent and adds 9 items', () => {
  const b = biz(); const n = b.items.length
  assert.equal(ensureProcessItems(b), false)
  assert.equal(b.items.length, n)
  assert.equal(b.items.filter((i) => i.type === 'wip').length, 9)
  assert.ok(b.items.some((i) => i.id === 'pb'))
  assert.deepEqual(b.items.find((i) => i.id === 'stk_ec').bom.map((m) => m.item), ['cu', 'mi', 'pb'])
  assert.deepEqual(b.items.find((i) => i.id === 'mld_ec').bom.map((m) => m.item), ['stk_ec', 'mo'])
})

test('issue -> receive -> moulding moves stock and cost along', () => {
  const b = biz()
  assert.ok(applyScan(b, sc({ process: 'stacking', action: 'issue', type: 'ec', qty: 1000, lot: 'STK-1', sup: 's1' })).ok)
  let v = valuation(b)
  assert.equal(v.qty.av_ec, 1000)
  assert.ok(Math.abs(v.qty.cu - (1000 - 15)) < 1e-6)
  assert.ok(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'ec', qty: 980, rejects: 10, lot: 'STK-1', charge: 1000 })).ok)
  v = valuation(b)
  assert.equal(v.qty.av_ec, 0)
  assert.equal(v.qty.stk_ec, 980)
  const mat = 15 * 100 + 5 * 50 + 1000 * 2
  assert.ok(Math.abs(v.val.stk_ec - (mat + 1000 - 10 * 2)) < 0.01, 'all cost lands on good pieces; the 10 bushes of rejected pieces came back at ₹2')
  assert.equal(v.qty.pb, 5000 - 1000 + 10)
  assert.equal(openLots(b).length, 0)
  assert.ok(applyScan(b, sc({ process: 'moulding', action: 'run', type: 'ec', qty: 900, rejects: 20 })).ok)
  v = valuation(b)
  assert.equal(v.qty.mld_ec, 900)
  assert.equal(v.qty.stk_ec, 60)
})

test('duplicates, double receive, wrong type and low stock are refused', () => {
  const b = biz()
  const i = sc({ process: 'stacking', action: 'issue', type: 'hook', qty: 100, lot: 'L1' })
  assert.ok(applyScan(b, i).ok)
  assert.ok(applyScan(b, i).duplicate)
  assert.equal(b.mv.length, 1)
  assert.match(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'ec', qty: 10, lot: 'L1' })).error, /not/)
  assert.ok(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'hook', qty: 100, lot: 'L1' })).ok)
  assert.match(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'hook', qty: 5, lot: 'L1' })).error, /already/)
  assert.match(applyScan(b, sc({ process: 'moulding', action: 'run', type: 'w750', qty: 50 })).error, /Not enough stock/)
  assert.ok(previewScan(b, sc({ process: 'moulding', action: 'run', type: 'w750', qty: 50 })).shortStock.length > 0)
})

test('QR text round-trips and rejects tampering', () => {
  const t = bizTag('abc-123xyz')
  const q = qrText(t, 'stacking')
  assert.deepEqual(parseQr(q), { tag: t, process: 'stacking' })
  assert.equal(parseQr(q.replace('STACKING', 'MOULDING')), null)
  assert.equal(parseQr('hello'), null)
})

import { qrMatrix, qrSvg } from '../../src/lib/qrcode.js'
import { pairText, parsePair } from '../../src/lib/process.js'
test('QR writer: sizes, finder patterns, determinism; pairing text', () => {
  const m = qrMatrix('V4|STACKING|k29d')
  assert.equal(m.length, 25) // version 2
  assert.deepEqual(m[0].slice(0, 7), [1, 1, 1, 1, 1, 1, 1])
  assert.deepEqual(m[3].slice(0, 7), [1, 0, 1, 1, 1, 0, 1])
  assert.equal(qrSvg('abc'), qrSvg('abc'))
  assert.throws(() => qrMatrix('x'.repeat(200)))
  assert.equal(parsePair(pairText('abc123')), 'abc123')
  assert.equal(parsePair('nope'), null)
})

test('plastic bush is reusable: returned after moulding at cost, rejected bushes are lost', () => {
  const b = biz()
  const q = () => valuation(b)
  assert.ok(applyScan(b, sc({ process: 'stacking', action: 'issue', type: 'ec', qty: 1000, lot: 'L9', sup: 's1' })).ok)
  assert.equal(q().qty.pb, 4000) // 1000 bushes went out with the batch
  // receive: 980 good, 10 rejected pieces, 2 of their bushes damaged
  assert.ok(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'ec', qty: 980, rejects: 10, bushRejects: 2, lot: 'L9' })).ok)
  assert.equal(q().qty.pb, 4000 + 8) // 10 rejected pieces - 2 damaged bushes come back
  assert.match(applyScan(b, sc({ process: 'stacking', action: 'receive', type: 'ec', qty: 1, rejects: 0, bushRejects: 5, lot: 'L9x' })).error, /not issued|More bushes/)
  // moulding 900 good + 20 rejects, 5 bushes damaged: 915 come back
  assert.ok(applyScan(b, sc({ process: 'moulding', action: 'run', type: 'ec', qty: 900, rejects: 20, bushRejects: 5 })).ok)
  const v = q()
  assert.equal(v.qty.pb, 4008 + 915)
  // returned bushes are valued at the bush's average cost (₹2), so they are taken off the moulded pieces' cost
  assert.ok(Math.abs(v.val.pb - (4008 + 915) * 2) < 0.01)
  const mat = 15 * 100 + 5 * 50 + 1000 * 2
  const stk = mat - 8 * 2 // stacked cost net of the bushes that came back
  const per = stk / 980
  const mouldCost = 920 * per + 27.6 * 20 - 915 * 2
  assert.ok(Math.abs(v.val.mld_ec - mouldCost) < 0.02)
  assert.match(applyScan(b, sc({ process: 'moulding', action: 'run', type: 'ec', qty: 10, bushRejects: 99 })).error, /More bushes/)
  assert.match(applyScan(b, sc({ process: 'stacking', action: 'issue', type: 'ec', qty: 5, lot: 'Lx', bushRejects: 1 })).error, /rejected when/)
})
