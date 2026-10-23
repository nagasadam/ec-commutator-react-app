// Statements and financial reports. Everything here is derived from the business
// object; nothing is stored (notes §4).
import { acctBal, acctName, acctOpen, calc, custBal, find, invTot, prrTot, purTot, srTot, supBal, valuation } from './calc.js'
import { r2 } from './format.js'

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
const byDate = (a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : a.o - c.o)

// Customer or supplier statement: opening balance, then dated debits/credits with a
// running balance (positive = they owe us for customers / we owe them for suppliers).
export function ledger(b, party, kind) {
  const isCust = kind === 'cust'
  const rows = []
  let o = 0
  const add = (date, ref, text, debit, credit) => rows.push({ date, ref, text, debit: r2(debit), credit: r2(credit), o: o++ })
  if (isCust) {
    b.inv.filter((i) => i.cust === party.id).forEach((i) => add(i.date, i.no, 'Invoice', invTot(b, i).total, 0))
    b.sr.filter((s) => find(b.inv, s.inv)?.cust === party.id).forEach((s) => add(s.date, s.no, 'Credit note', 0, srTot(b, s).total))
    b.tx.filter((t) => t.kind === 'recv' && t.party === party.id).forEach((t) => add(t.date, find(b.inv, t.ref)?.no || '', 'Received · ' + acctName(b, t.acct), 0, t.amt))
  } else {
    b.pur.filter((p) => p.sup === party.id).forEach((p) => add(p.date, p.no, 'Purchase', purTot(b, p).total, 0))
    b.prr.filter((s) => find(b.pur, s.pur)?.sup === party.id).forEach((s) => add(s.date, s.no, 'Debit note', 0, prrTot(b, s).total))
    b.tx.filter((t) => t.kind === 'pay' && t.party === party.id).forEach((t) => add(t.date, find(b.pur, t.ref)?.no || '', 'Paid · ' + acctName(b, t.acct), 0, t.amt))
  }
  rows.sort(byDate)
  let bal = +party.open || 0
  const out = rows.map((r) => {
    bal = r2(bal + r.debit - r.credit)
    return { ...r, balance: bal }
  })
  const closing = out.length ? out[out.length - 1].balance : r2(+party.open || 0)
  return { opening: r2(+party.open || 0), rows: out, closing, debit: r2(sum(out, (r) => r.debit)), credit: r2(sum(out, (r) => r.credit)) }
}

// Every dated event in one list, newest last. `money` is the effect on cash+bank (+in / -out).
export function daybook(b) {
  const ev = []
  let o = 0
  const add = (date, type, ref, who, amount, money = 0) => ev.push({ date, type, ref, who, amount: r2(amount), money: r2(money), o: o++ })
  const name = (id) => find(b.cust, id)?.name || find(b.sup, id)?.name || ''
  b.inv.forEach((i) => add(i.date, 'Invoice', i.no, name(i.cust), invTot(b, i).total))
  b.pur.forEach((p) => add(p.date, 'Purchase', p.no, name(p.sup), purTot(b, p).total))
  b.sr.forEach((s) => add(s.date, 'Credit note', s.no, name(find(b.inv, s.inv)?.cust), srTot(b, s).total))
  b.prr.forEach((s) => add(s.date, 'Debit note', s.no, name(find(b.pur, s.pur)?.sup), prrTot(b, s).total))
  b.prod.forEach((p) => add(p.date, 'Production', '', find(b.items, p.item)?.name || '', p.qty))
  b.rej.forEach((r) => add(r.date, 'Reject', '', find(b.items, r.item)?.name || '', r.qty))
  b.exp.forEach((e) => add(e.date, 'Expense', e.head, acctName(b, e.acct), e.amt, -e.amt))
  b.tx.forEach((t) => add(t.date, t.kind === 'recv' ? 'Receipt' : 'Payment', find(b.inv, t.ref)?.no || find(b.pur, t.ref)?.no || '', name(t.party), t.amt, t.kind === 'recv' ? t.amt : -t.amt))
  return ev.sort(byDate)
}

// Monthly sales / purchases / expenses for the bar chart (taxable amounts).
export function monthly(b) {
  const m = {}
  const at = (d) => (m[d.slice(0, 7)] ||= { month: d.slice(0, 7), sales: 0, purchases: 0, expenses: 0 })
  b.inv.forEach((i) => (at(i.date).sales += invTot(b, i).taxable))
  b.sr.forEach((s) => (at(s.date).sales -= srTot(b, s).taxable))
  b.pur.forEach((p) => (at(p.date).purchases += purTot(b, p).taxable))
  b.prr.forEach((s) => (at(s.date).purchases -= prrTot(b, s).taxable))
  b.exp.forEach((e) => (at(e.date).expenses += e.amt))
  return Object.values(m)
    .sort((a, c) => (a.month < c.month ? -1 : 1))
    .map((x) => ({ month: x.month, sales: r2(x.sales), purchases: r2(x.purchases), expenses: r2(x.expenses) }))
}

const accounts = (b) => [...b.banks.map((k) => k.id), 'cash', 'gpay']

// Assets − liabilities equals owner capital + profit by construction (see tests).
export function balanceSheet(b) {
  const c = calc(b)
  const v = valuation(b)
  const accts = accounts(b).map((id) => ({ label: acctName(b, id), amt: acctBal(b, id) }))
  const debtors = r2(sum(b.cust, (p) => custBal(b, p)))
  const creditors = r2(sum(b.sup, (p) => supBal(b, p)))
  const assets = [...accts, { label: 'Customers owe us', amt: debtors }, { label: 'Closing stock', amt: c.closingStock }, { label: 'GST input credit', amt: c.gstIn }]
  const liabilities = [
    { label: 'We owe suppliers', amt: creditors },
    { label: 'GST output payable', amt: c.gstOut },
  ]
  const capital = r2(sum(accounts(b), (id) => acctOpen(b, id)) + sum(b.cust, (p) => +p.open || 0) - sum(b.sup, (p) => +p.open || 0) + v.opening)
  const totalAssets = r2(sum(assets, (x) => x.amt))
  const totalLiab = r2(sum(liabilities, (x) => x.amt))
  const equity = [
    { label: 'Opening capital', amt: capital },
    { label: 'Profit for the period', amt: c.profit },
  ]
  return { assets, liabilities, equity, totalAssets, totalLiab, totalEquity: r2(capital + c.profit), balanced: Math.abs(totalAssets - totalLiab - capital - c.profit) < 0.005 }
}

// Trial balance before closing stock is brought in (opening stock is the stock line).
export function trialBalance(b) {
  const c = calc(b)
  const v = valuation(b)
  const bs = balanceSheet(b)
  const lines = []
  const put = (label, amt) => lines.push({ label, dr: amt >= 0 ? r2(amt) : 0, cr: amt < 0 ? r2(-amt) : 0 })
  const putCr = (label, amt) => lines.push({ label, dr: amt < 0 ? r2(-amt) : 0, cr: amt >= 0 ? r2(amt) : 0 })
  bs.assets.slice(0, accounts(b).length).forEach((a) => put(a.label, a.amt))
  put('Customers owe us', bs.assets[accounts(b).length].amt)
  put('Opening stock', v.opening)
  put('Purchases (net of debit notes)', c.purNet)
  put('Expenses', c.expenses)
  put('GST input credit', c.gstIn)
  putCr('We owe suppliers', bs.liabilities[0].amt)
  putCr('GST output payable', c.gstOut)
  putCr('Sales (net of credit notes)', c.sales)
  putCr('Opening capital', bs.equity[0].amt)
  const dr = r2(sum(lines, (l) => l.dr))
  const cr = r2(sum(lines, (l) => l.cr))
  return { lines, dr, cr, balanced: Math.abs(dr - cr) < 0.005 }
}

// "Cash & GPay people": a read-only view over existing cash/GPay transactions, plus
// pinned parties (b.pp = [{ id: partyId }]). No new transaction type is introduced.
export function cashPeople(b) {
  const m = new Map()
  const who = (id) => {
    if (!m.has(id)) m.set(id, { id, name: find(b.cust, id)?.name || find(b.sup, id)?.name || '?', cashIn: 0, cashOut: 0, gpayIn: 0, gpayOut: 0, count: 0, pinned: false })
    return m.get(id)
  }
  b.tx
    .filter((t) => t.acct === 'cash' || t.acct === 'gpay')
    .forEach((t) => {
      const p = who(t.party)
      p[t.acct + (t.kind === 'recv' ? 'In' : 'Out')] = r2(p[t.acct + (t.kind === 'recv' ? 'In' : 'Out')] + t.amt)
      p.count++
    })
  b.pp.forEach((x) => {
    if (find(b.cust, x.id) || find(b.sup, x.id)) who(x.id).pinned = true
  })
  return [...m.values()].sort((a, c) => Number(c.pinned) - Number(a.pinned) || a.name.localeCompare(c.name))
}

export function togglePin(b, partyId) {
  const i = b.pp.findIndex((x) => x.id === partyId)
  if (i >= 0) b.pp.splice(i, 1)
  else b.pp.push({ id: partyId })
}
