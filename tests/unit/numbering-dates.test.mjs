import test from 'node:test'
import assert from 'node:assert/strict'
import { nextNo } from '../../src/lib/model.js'
import { dateError } from '../../src/lib/rules.js'

test('nextNo continues after the highest number, even after a delete', () => {
  const l = [{ no: 'INV-0001' }, { no: 'INV-0003' }]
  assert.equal(nextNo(l, 'INV-'), 'INV-0004')
})

test('nextNo starts at 1 and ignores other prefixes', () => {
  assert.equal(nextNo([], 'INV-'), 'INV-0001')
  assert.equal(nextNo([{ no: 'BILL-0009' }], 'INV-'), 'INV-0001')
  assert.equal(nextNo([{ no: 'BILL-0009' }], 'BILL-'), 'BILL-0010')
})

test('nextNo handles numbers past four digits', () => {
  assert.equal(nextNo([{ no: 'INV-9999' }], 'INV-'), 'INV-10000')
})

test('dateError accepts real dates and rejects blank or impossible ones', () => {
  assert.equal(dateError('2026-11-07'), '')
  assert.equal(dateError('2028-02-29'), '')
  assert.equal(dateError(''), 'Pick a date.')
  assert.equal(dateError(undefined), 'Pick a date.')
  assert.equal(dateError('2026-02-30'), 'That date does not exist.')
  assert.equal(dateError('07/11/2026'), 'Pick a date.')
})
