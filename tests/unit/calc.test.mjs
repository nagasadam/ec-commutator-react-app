import test from 'node:test'
import assert from 'node:assert/strict'
import { calc, custBal, supBal, taxOf, supplyType, valuation, acctOptions } from '../../src/lib/calc.js'
import { demoBiz, GUIDE } from '../../src/lib/seed.js'
import { mkBiz } from '../../src/lib/model.js'
import { r2, inr } from '../../src/lib/format.js'

test('demo business reproduces every figure in the notes', () => {
  const c = calc(demoBiz())
  for (const [k, want] of Object.entries(GUIDE)) assert.ok(Math.abs(c[k] - want) < 0.005, `${k}: ${c[k]} vs ${want}`)
})

test('GST: intra-state splits CGST/SGST, inter-state is IGST, persons pay none', () => {
  const b = mkBiz('t', 'person')
  const intra = taxOf(b, { company: true, gstin: '33AAACA1234B1Z5' }, 1000)
  assert.deepEqual([intra.cgst, intra.sgst, intra.igst, intra.total], [90, 90, 0, 1180])
  const inter = taxOf(b, { company: true, gstin: '29AABCS5678C1Z2' }, 1000)
  assert.deepEqual([inter.cgst, inter.igst, inter.total], [0, 180, 1180])
  assert.equal(taxOf(b, { company: false }, 1000).total, 1000)
  assert.equal(supplyType(b, { gstin: '29X' }), 'inter')
})

test('state code of the business drives intra/inter', () => {
  const b = mkBiz('t')
  b.stateCode = '29'
  assert.equal(taxOf(b, { company: true, gstin: '29AABCS5678C1Z2' }, 100).igst, 0)
})

test('stock is derived: demo ends with positive finished goods and zero raw copper shortage', () => {
  const v = valuation(demoBiz())
  assert.equal(v.qty.cm, 2400 - 1000 - 600 - 50 - 500 - 30 + 40)
  assert.ok(v.qty.cu > 0)
})

test('balances: customer and supplier figures from the notes', () => {
  const b = demoBiz()
  assert.equal(custBal(b, b.cust.find((c) => c.id === 'sun')), 103666 - custBal(b, b.cust.find((c) => c.id === 'apex')) - custBal(b, b.cust.find((c) => c.id === 'ram')))
  assert.equal(supBal(b, b.sup[1]), 0)
})

test('rounding and rupee formatting', () => {
  assert.equal(r2(1.005), 1.01)
  assert.equal(inr(1234567.5), '₹12,34,567.50')
  assert.equal(inr(-50), '-₹50')
})

test('account options: person-based allows cash/GPay for persons, firm-based is bank-only', () => {
  const b = demoBiz()
  assert.deepEqual(acctOptions(b, { company: false }).map((o) => o.id), ['cash', 'gpay'])
  assert.deepEqual(acctOptions(b, { company: true }).map((o) => o.id), ['hdfc'])
  b.kind = 'firm'
  assert.deepEqual(acctOptions(b, { company: false }).map((o) => o.id), ['hdfc'])
})

test('return and reject effects: credit note lowers sales, reject lowers stock only', () => {
  const b = demoBiz()
  const before = calc(b)
  b.sr = []
  assert.ok(calc(b).sales > before.sales)
  const b2 = demoBiz()
  const q = valuation(b2).qty.cm
  b2.rej = []
  assert.equal(valuation(b2).qty.cm, q + 30)
})
