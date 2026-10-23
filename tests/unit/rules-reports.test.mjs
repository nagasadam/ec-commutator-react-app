import test from 'node:test'
import assert from 'node:assert/strict'
import { partyError, settleError, settleAccounts, kindSwitchError } from '../../src/lib/rules.js'
import { ledger, daybook, monthly, balanceSheet, trialBalance, cashPeople, togglePin } from '../../src/lib/reports.js'
import { calc } from '../../src/lib/calc.js'
import { demoBiz } from '../../src/lib/seed.js'
import { mkBiz } from '../../src/lib/model.js'

test('party rules', () => {
  const p = mkBiz('p', 'person')
  const f = mkBiz('f', 'firm')
  assert.match(partyError(p, { name: '' }), /name/)
  assert.match(partyError(p, { name: 'A', company: true, gstin: 'bad' }), /GSTIN/)
  assert.equal(partyError(p, { name: 'A', company: false }), '')
  assert.equal(partyError(p, { name: 'A', company: true, gstin: '33aaaca1234b1z5' }), '')
  assert.match(partyError(f, { name: 'A', company: false }), /firm-based/)
})

test('settlement rules', () => {
  const p = demoBiz()
  const person = p.cust.find((c) => !c.company)
  const firm = p.cust.find((c) => c.company)
  assert.equal(settleError(p, person, 'cash', 10), '')
  assert.match(settleError(p, person, 'hdfc', 10), /Cash or GPay/)
  assert.match(settleError(p, firm, 'cash', 10), /bank/)
  assert.match(settleError(p, null, 'cash', 10), /Choose/)
  p.kind = 'firm'
  assert.deepEqual(settleAccounts(p, person).map((a) => a.id), ['hdfc'])
})

test('switching to firm-based is refused while persons or cash entries exist', () => {
  assert.ok(kindSwitchError(demoBiz(), 'firm'))
  assert.equal(kindSwitchError(mkBiz('x'), 'firm'), '')
  assert.equal(kindSwitchError(demoBiz(), 'person'), '')
})

test('ledger closing balance equals the party balance', () => {
  const b = demoBiz()
  const sun = b.cust.find((c) => c.id === 'sun')
  const l = ledger(b, sun, 'cust')
  assert.equal(l.opening, 15000)
  assert.equal(l.rows.at(-1).balance, l.closing)
  assert.equal(l.closing, 15000 + l.debit - l.credit)
  const ster = ledger(b, b.sup.find((s) => s.id === 'ster'), 'sup')
  assert.ok(ster.rows.some((r) => r.text === 'Debit note'))
})

test('daybook lists every record in date order', () => {
  const b = demoBiz()
  const d = daybook(b)
  const n = b.inv.length + b.pur.length + b.sr.length + b.prr.length + b.prod.length + b.rej.length + b.exp.length + b.tx.length
  assert.equal(d.length, n)
  assert.deepEqual(d.map((x) => x.date), [...d.map((x) => x.date)].sort())
})

test('monthly series adds up to the headline figures', () => {
  const b = demoBiz()
  const m = monthly(b)
  const c = calc(b)
  assert.equal(Math.round(m.reduce((s, x) => s + x.sales, 0) * 100) / 100, c.sales)
  assert.equal(Math.round(m.reduce((s, x) => s + x.expenses, 0) * 100) / 100, c.expenses)
})

test('balance sheet and trial balance balance for demo and for a messy business', () => {
  const b = demoBiz()
  assert.ok(balanceSheet(b).balanced)
  assert.ok(trialBalance(b).balanced)
  b.cust[0].open = -500
  b.sup[0].open = 1234.56
  b.items[0].open = 10
  b.items[0].openCost = 7
  b.tx.push({ id: 'zz', date: '2026-10-01', kind: 'recv', party: 'ram', amt: 99999, acct: 'cash', ref: '' })
  assert.ok(balanceSheet(b).balanced)
  assert.ok(trialBalance(b).balanced)
})

test('empty business balances at zero', () => {
  const b = mkBiz('e')
  const bs = balanceSheet(b)
  assert.equal(bs.totalAssets, 0)
  assert.ok(bs.balanced && trialBalance(b).balanced)
})

test('cash & GPay people is a view; pins do not create transactions', () => {
  const b = demoBiz()
  const before = b.tx.length
  const people = cashPeople(b)
  const ram = people.find((p) => p.id === 'ram')
  assert.equal(ram.cashIn, 3000)
  assert.equal(ram.gpayIn, 2500)
  assert.ok(!people.some((p) => p.id === 'apex')) // bank only
  togglePin(b, 'apex')
  assert.equal(cashPeople(b)[0].id, 'apex')
  assert.equal(b.tx.length, before)
  togglePin(b, 'apex')
  assert.equal(b.pp.length, 0)
})
