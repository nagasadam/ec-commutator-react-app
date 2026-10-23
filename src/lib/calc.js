import { r2 } from './format.js'

export const GST = 0.18
export const find = (arr, id) => arr.find((x) => x.id === id)

// ---------- GST ----------
// Same state code on the GSTIN => CGST+SGST, otherwise IGST.
export function supplyType(b, party) {
  if (!party?.gstin) return 'intra'
  return party.gstin.slice(0, 2) === b.stateCode ? 'intra' : 'inter'
}

export const lineSum = (lines) => r2(lines.reduce((s, l) => s + (+l.qty || 0) * (+l.rate || 0), 0))

// Firms (companies) carry 18% GST; persons carry none.
export function taxOf(b, party, taxable) {
  taxable = r2(taxable)
  if (!party?.company) return { taxable, cgst: 0, sgst: 0, igst: 0, gst: 0, total: taxable, type: 'none' }
  const gst = r2(taxable * GST)
  if (supplyType(b, party) === 'inter') return { taxable, cgst: 0, sgst: 0, igst: gst, gst, total: r2(taxable + gst), type: 'inter' }
  const h = r2(gst / 2)
  return { taxable, cgst: h, sgst: h, igst: 0, gst: r2(h * 2), total: r2(taxable + h * 2), type: 'intra' }
}

export const invTot = (b, inv) => taxOf(b, find(b.cust, inv.cust), lineSum(inv.lines))
export const purTot = (b, p) => taxOf(b, find(b.sup, p.sup), lineSum(p.lines))

// Credit note (sales return) priced at the original invoice line rate.
export function srTot(b, s) {
  const inv = find(b.inv, s.inv)
  const l = inv?.lines.find((x) => x.item === s.item)
  return taxOf(b, find(b.cust, inv?.cust), (+s.qty || 0) * (l?.rate || 0))
}
// Debit note (purchase return) priced at the original purchase line rate.
export function prrTot(b, s) {
  const p = find(b.pur, s.pur)
  const l = p?.lines.find((x) => x.item === s.item)
  return taxOf(b, find(b.sup, p?.sup), (+s.qty || 0) * (l?.rate || 0))
}

// ---------- Stock & costing (derived, never stored) ----------
// Moving-average cost, events processed in date order:
// purchases + opening add raw; production consumes raw by BOM and creates FG at
// the consumed cost; sales/rejects/purchase returns take stock out; sales
// returns bring FG back at the current average.
export function valuation(b) {
  const qty = {}
  const val = {}
  const last = {}
  b.items.forEach((i) => {
    qty[i.id] = +i.open || 0
    val[i.id] = (+i.open || 0) * (+i.openCost || 0)
    last[i.id] = +i.openCost || 0
  })
  const avg = (id) => (qty[id] > 0 ? val[id] / qty[id] : last[id] || 0)
  const add = (id, q, cost) => {
    if (!(id in qty)) return
    qty[id] += q
    val[id] += cost
    if (qty[id] > 0) last[id] = val[id] / qty[id]
  }
  const take = (id, q, cost) => {
    if (!(id in qty)) return 0
    const c = cost ?? avg(id)
    qty[id] -= q
    val[id] -= q * c
    return q * c
  }

  const ev = []
  b.pur.forEach((x) => ev.push({ t: 0, d: x.date, k: 'pur', x }))
  b.prr.forEach((x) => ev.push({ t: 1, d: x.date, k: 'prr', x }))
  b.prod.forEach((x) => ev.push({ t: 2, d: x.date, k: 'prod', x }))
  b.inv.forEach((x) => ev.push({ t: 3, d: x.date, k: 'inv', x }))
  b.sr.forEach((x) => ev.push({ t: 4, d: x.date, k: 'sr', x }))
  b.rej.forEach((x) => ev.push({ t: 5, d: x.date, k: 'rej', x }))
  ev.sort((a, c) => (a.d < c.d ? -1 : a.d > c.d ? 1 : a.t - c.t))

  const prod = {}
  const cogs = {}
  for (const { k, x } of ev) {
    if (k === 'pur') x.lines.forEach((l) => add(l.item, +l.qty, l.qty * l.rate))
    else if (k === 'prr') {
      const p = find(b.pur, x.pur)
      const l = p?.lines.find((y) => y.item === x.item)
      take(x.item, +x.qty, l?.rate || 0)
    } else if (k === 'prod') {
      const fg = find(b.items, x.item)
      const used = (fg?.bom || []).map((m) => {
        const q = m.qty * x.qty
        return { item: m.item, qty: q, cost: take(m.item, q) }
      })
      const cost = used.reduce((s, u) => s + u.cost, 0)
      add(x.item, +x.qty, cost)
      prod[x.id] = { cost, used }
    } else if (k === 'inv') {
      cogs[x.id] = x.lines.reduce((s, l) => s + take(l.item, +l.qty), 0)
    } else if (k === 'sr') add(x.item, +x.qty, x.qty * avg(x.item))
    else if (k === 'rej') take(x.item, +x.qty)
  }

  const closing = b.items.reduce((s, i) => s + val[i.id], 0)
  const opening = b.items.reduce((s, i) => s + (+i.open || 0) * (+i.openCost || 0), 0)
  const avgs = Object.fromEntries(b.items.map((i) => [i.id, avg(i.id)]))
  return { qty, val, avg: avgs, closing: r2(closing), opening: r2(opening), prod, cogs }
}

// ---------- Parties, payments, accounts ----------
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)

export const paidFor = (b, ref) => r2(sum(b.tx.filter((t) => t.ref === ref), (t) => t.amt))

export const custBal = (b, c) =>
  r2(
    (+c.open || 0) +
      sum(b.inv.filter((i) => i.cust === c.id), (i) => invTot(b, i).total) -
      sum(b.sr.filter((s) => find(b.inv, s.inv)?.cust === c.id), (s) => srTot(b, s).total) -
      sum(b.tx.filter((t) => t.kind === 'recv' && t.party === c.id), (t) => t.amt),
  )

export const supBal = (b, s) =>
  r2(
    (+s.open || 0) +
      sum(b.pur.filter((p) => p.sup === s.id), (p) => purTot(b, p).total) -
      sum(b.prr.filter((r) => find(b.pur, r.pur)?.sup === s.id), (r) => prrTot(b, r).total) -
      sum(b.tx.filter((t) => t.kind === 'pay' && t.party === s.id), (t) => t.amt),
  )

// Accounts: a bank id, 'cash' or 'gpay'.
export const acctOpen = (b, a) => (a === 'cash' ? +b.cashOpen || 0 : a === 'gpay' ? +b.gpayOpen || 0 : +find(b.banks, a)?.open || 0)

export const acctBal = (b, a) =>
  r2(
    acctOpen(b, a) +
      sum(b.tx.filter((t) => t.acct === a), (t) => (t.kind === 'recv' ? t.amt : -t.amt)) -
      sum(b.exp.filter((e) => e.acct === a), (e) => e.amt),
  )

// Persons settle by cash/GPay, firms by bank; a firm-based business is bank-only (see rules.js).
export const acctOptions = (b, party) => {
  const banks = b.banks.map((k) => ({ id: k.id, label: k.name }))
  if (b.kind === 'firm') return banks
  const cg = [
    { id: 'cash', label: 'Cash' },
    { id: 'gpay', label: 'GPay' },
  ]
  if (!party) return [...banks, ...cg]
  return party.company ? banks : cg
}

export const acctName = (b, a) => (a === 'cash' ? 'Cash' : a === 'gpay' ? 'GPay' : find(b.banks, a)?.name || '—')

// ---------- Report numbers ----------
export function calc(b) {
  const v = valuation(b)
  const invs = b.inv.map((i) => invTot(b, i))
  const crs = b.sr.map((s) => srTot(b, s))
  const purs = b.pur.map((p) => purTot(b, p))
  const drs = b.prr.map((s) => prrTot(b, s))
  const sales = r2(sum(invs, (x) => x.taxable) - sum(crs, (x) => x.taxable))
  const gstOut = r2(sum(invs, (x) => x.gst) - sum(crs, (x) => x.gst))
  const purNet = r2(sum(purs, (x) => x.taxable) - sum(drs, (x) => x.taxable))
  const gstIn = r2(sum(purs, (x) => x.gst) - sum(drs, (x) => x.gst))
  const expenses = r2(sum(b.exp, (e) => e.amt))
  const profit = r2(sales + v.closing - v.opening - purNet - expenses)
  const receivable = r2(sum(b.cust.map((c) => custBal(b, c)).filter((x) => x > 0), (x) => x))
  const payable = r2(sum(b.sup.map((s) => supBal(b, s)).filter((x) => x > 0), (x) => x))
  const banks = Object.fromEntries(b.banks.map((k) => [k.id, acctBal(b, k.id)]))
  return {
    sales,
    gstOut,
    purNet,
    gstIn,
    expenses,
    profit,
    receivable,
    payable,
    closingStock: v.closing,
    bankTotal: r2(sum(Object.values(banks), (x) => x)),
    banks,
    cash: acctBal(b, 'cash'),
    gpay: acctBal(b, 'gpay'),
    gstNet: r2(gstOut - gstIn),
  }
}
