import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkBiz } from '../../src/lib/model.js'
import { valuation } from '../../src/lib/calc.js'
import { ensureProcessItems, applyScan, previewScan, openLots, qrText, parseQr, bizTag } from '../../src/lib/process.js'

const biz = () => {
  const b = mkBiz ? mkBiz('t') : null
  ensureProcessItems(b)
  // plenty of raw stock at a known cost
  for (const [id, q, c] of [['cu', 1000, 100], ['mi', 100, 50], ['mo', 500, 20]]) {
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
  const mat = 15 * 100 + 5 * 50
  assert.ok(Math.abs(v.val.stk_ec - (mat + 1000)) < 0.01, 'all cost lands on good pieces')
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
