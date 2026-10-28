import test from 'node:test'
import assert from 'node:assert/strict'
import { demoBiz } from '../../src/lib/seed.js'
import { find, invTot, srTot, purTot, prrTot, paidFor, saleRows, purRows, custBal, supBal, custBals, supBals, calc } from '../../src/lib/calc.js'

// The indexed row builders must give exactly what the per-document searches gave.
const oldSale = (b) =>
  [...b.inv].reverse().map((i) => {
    const c = find(b.cust, i.cust)
    const t = invTot(b, i)
    const cn = b.sr.filter((x) => x.inv === i.id).reduce((n, r) => n + srTot(b, r).total, 0)
    const open = Math.max(0, t.total - cn - paidFor(b, i.id))
    return { i, c, t, open, isPaid: open < 0.5, person: !c?.company }
  })
const oldPur = (b) =>
  [...b.pur].reverse().map((p) => {
    const sp = find(b.sup, p.sup)
    const t = purTot(b, p)
    const dn = b.prr.filter((r) => r.pur === p.id).reduce((n, r) => n + prrTot(b, r).total, 0)
    const open = Math.max(0, t.total - dn - paidFor(b, p.id))
    return { p, sp, t, open, isPaid: open < 0.5, person: !sp?.company }
  })

function busy() {
  const b = demoBiz()
  // more documents, part payments and returns than the demo ships with
  const inv = b.inv.slice()
  for (let k = 0; k < 40; k++) {
    const src = inv[k % inv.length]
    b.inv.push({ ...src, id: 'x' + k })
    b.tx.push({ id: 'tx' + k, date: '2026-09-20', kind: 'recv', party: src.cust, amt: 100.35 + k, acct: 'bank', ref: k % 2 ? 'x' + k : src.id })
    if (k % 7 === 0 && b.sr[0]) b.sr.push({ ...b.sr[0], id: 'sr' + k, inv: 'x' + k, item: src.lines[0].item, qty: 1 })
  }
  return b
}

test('saleRows matches the per-invoice searches', () => {
  for (const b of [demoBiz(), busy()]) assert.deepEqual(saleRows(b), oldSale(b))
})

test('purRows matches the per-purchase searches', () => {
  const b = busy()
  const pur = b.pur.slice()
  for (let k = 0; k < 20; k++) {
    const src = pur[k % pur.length]
    b.pur.push({ ...src, id: 'np' + k })
    b.tx.push({ id: 'pt' + k, date: '2026-09-21', kind: 'pay', party: src.sup, amt: 50.1 + k, acct: 'bank', ref: k % 2 ? 'np' + k : src.id })
  }
  for (const x of [demoBiz(), b]) assert.deepEqual(purRows(x), oldPur(x))
})

test('custBals / supBals match one-party-at-a-time balances', () => {
  const b = busy()
  const cb = custBals(b), sb = supBals(b)
  for (const c of b.cust) assert.equal(cb.get(c.id), custBal(b, c))
  for (const s of b.sup) assert.equal(sb.get(s.id), supBal(b, s))
  assert.ok(cb.size > 0 && sb.size > 0)
  assert.ok(Number.isFinite(calc(b).receivable))
})
