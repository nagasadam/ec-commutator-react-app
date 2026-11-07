import test from 'node:test'
import assert from 'node:assert/strict'
import { demoBiz } from '../../src/lib/seed.js'
import { lineFor, srTot, prrTot, saleRows } from '../../src/lib/calc.js'

test('lineFor adds up the same item on several lines and weights the rate', () => {
  const l = lineFor([{ item: 'cm', qty: 100, rate: 90 }, { item: 'cm', qty: 300, rate: 100 }, { item: 'br', qty: 5, rate: 1 }], 'cm')
  assert.equal(l.qty, 400)
  assert.equal(l.rate, 97.5)
})

test('lineFor returns a single line untouched and nothing for a missing item', () => {
  const one = { item: 'cm', qty: 600, rate: 98 }
  assert.equal(lineFor([one], 'cm'), one)
  assert.equal(lineFor([one], 'br'), undefined)
  assert.equal(lineFor(undefined, 'cm'), undefined)
})

test('credit note on an invoice with the item on two lines uses the weighted rate', () => {
  const b = demoBiz()
  b.inv.push({ id: 'm1', no: 'INV-0099', date: '2026-10-01', cust: 'apex', lines: [{ item: 'cm', qty: 100, rate: 90 }, { item: 'cm', qty: 300, rate: 100 }] })
  b.sr.push({ id: 'c9', no: 'CN-0099', date: '2026-10-02', inv: 'm1', item: 'cm', qty: 200 })
  const t = srTot(b, b.sr.at(-1))
  assert.equal(t.taxable, 19500) // 200 x 97.50
  assert.equal(t.total, 23010) // + 18%
  const row = saleRows(b).find((r) => r.i.id === 'm1')
  assert.ok(row.open < row.t.total) // the credit note reduces what is open
})

test('single-line documents give the same numbers as before', () => {
  const b = demoBiz()
  assert.equal(srTot(b, b.sr[0]).total, 4484) // CN-0001
  assert.equal(prrTot(b, b.prr[0]).taxable, 1250) // DN-0001: 10 x 125
})
