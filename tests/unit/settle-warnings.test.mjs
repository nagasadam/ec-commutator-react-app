import test from 'node:test'
import assert from 'node:assert/strict'
import { demoBiz } from '../../src/lib/seed.js'
import { settleWarnings } from '../../src/lib/rules.js'
import { find, custBal, acctBal } from '../../src/lib/calc.js'

test('no warning for an amount within what the customer owes', () => {
  const b = demoBiz()
  const apex = find(b.cust, 'apex')
  assert.deepEqual(settleWarnings(b, 'recv', apex, b.banks[0].id, 1000, ''), [])
})

test('warns when a receipt is more than the customer owes', () => {
  const b = demoBiz()
  const apex = find(b.cust, 'apex')
  const owed = custBal(b, apex)
  const w = settleWarnings(b, 'recv', apex, b.banks[0].id, owed + 1, '')
  assert.equal(w.length, 1)
  assert.match(w[0], /more than Apex Motors Pvt Ltd owes/)
})

test('against an invoice it compares with what is still open on that invoice', () => {
  const b = demoBiz()
  const apex = find(b.cust, 'apex')
  const w = settleWarnings(b, 'recv', apex, b.banks[0].id, 60000, 'i4') // INV-0003 is ₹56,050 and unpaid
  assert.match(w[0], /still open on INV-0003/)
  assert.deepEqual(settleWarnings(b, 'recv', apex, b.banks[0].id, 56050, 'i4'), [])
})

test('a payment larger than the account balance warns, a receipt never does', () => {
  const b = demoBiz()
  const sup = find(b.sup, 'ster')
  const bank = b.banks[0].id
  const have = acctBal(b, bank)
  const w = settleWarnings(b, 'pay', sup, bank, have + 1, 'p4')
  assert.ok(w.some((x) => /below zero/.test(x)))
  assert.ok(!settleWarnings(b, 'recv', find(b.cust, 'apex'), bank, 1, '').some((x) => /below zero/.test(x)))
})

test('blank party or amount gives nothing', () => {
  const b = demoBiz()
  assert.deepEqual(settleWarnings(b, 'recv', undefined, '', 5, ''), [])
  assert.deepEqual(settleWarnings(b, 'recv', find(b.cust, 'apex'), '', 0, ''), [])
})
