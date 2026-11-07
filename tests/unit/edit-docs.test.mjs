import test from 'node:test'
import assert from 'node:assert/strict'
import { demoBiz } from '../../src/lib/seed.js'
import { editInvoiceError, editPurchaseError } from '../../src/lib/rules.js'
import { find } from '../../src/lib/calc.js'

const inv = (b, id) => find(b.inv, id)
const pur = (b, id) => find(b.pur, id)

test('invoice: changing quantity or rate is allowed', () => {
  const b = demoBiz()
  assert.equal(editInvoiceError(b, inv(b, 'i4'), { party: 'apex', lines: [{ item: 'cm', qty: 450, rate: 96 }] }), '')
})

test('invoice: cannot go below what a credit note already returned', () => {
  const b = demoBiz() // CN-0001 returned 40 of INV-0001
  assert.match(editInvoiceError(b, inv(b, 'i1'), { party: 'apex', lines: [{ item: 'cm', qty: 30, rate: 95 }] }), /already returned/)
  assert.equal(editInvoiceError(b, inv(b, 'i1'), { party: 'apex', lines: [{ item: 'cm', qty: 40, rate: 95 }] }), '')
  assert.match(editInvoiceError(b, inv(b, 'i1'), { party: 'apex', lines: [{ item: 'cm', qty: 5, rate: 95 }, { item: 'cm', qty: 20, rate: 95 }] }), /already returned/)
})

test('invoice: customer cannot change while payments or returns exist', () => {
  const b = demoBiz()
  assert.match(editInvoiceError(b, inv(b, 'i1'), { party: 'sun', lines: inv(b, 'i1').lines }), /Remove those first/)
  assert.equal(editInvoiceError(b, inv(b, 'i4'), { party: 'sun', lines: inv(b, 'i4').lines }), '') // nothing linked
})

test('invoice: cannot switch between a firm and a person', () => {
  const b = demoBiz()
  assert.match(editInvoiceError(b, inv(b, 'i4'), { party: 'ram', lines: inv(b, 'i4').lines }), /firm and a person/)
})

test('purchase: cannot buy less than production and sales already used', () => {
  const b = demoBiz() // 2400 commutators were made from the brass inserts bought on PUR-0002
  assert.match(editPurchaseError(b, pur(b, 'p2'), { party: 'ster', lines: [{ item: 'br', qty: 100, rate: 2.5 }] }), /below zero/)
  assert.equal(editPurchaseError(b, pur(b, 'p2'), { party: 'ster', lines: [{ item: 'br', qty: 3000, rate: 3 }] }), '') // rate change only
})

test('purchase: supplier cannot change while a payment is linked', () => {
  const b = demoBiz()
  b.sup.push({ id: 'other', name: 'Other Metals Pvt Ltd', company: true, gstin: '33AAACO1234B1Z5' })
  assert.match(editPurchaseError(b, pur(b, 'p1'), { party: 'other', lines: pur(b, 'p1').lines }), /Remove those first/)
  assert.equal(editPurchaseError(b, pur(b, 'p2'), { party: 'other', lines: pur(b, 'p2').lines }), '') // nothing linked
})
