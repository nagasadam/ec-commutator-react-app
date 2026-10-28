// A large, realistic test business (default 3,000 records) for trying the app at scale.
// Same seed, same data every time. Documents are spread from April to October 2026.
import { mkBiz } from './model.js'

export const SAMPLE_RECORDS = 3000

export function bigSampleBiz(total = SAMPLE_RECORDS) {
  total = Math.max(300, total)
  let seed = 20261028
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
  const pick = (a) => a[int(0, a.length - 1)]
  const r2 = (n) => Math.round(n * 100) / 100
  const pad = (n, w = 4) => String(n).padStart(w, '0')

  // Shares of the total (they add up to 100%): invoices, purchases, payments, expenses, production, returns, rejects
  const n = {
    inv: Math.round(total * 0.34),
    pur: Math.round(total * 0.2),
    exp: Math.round(total * 0.08),
    prod: Math.round(total * 0.08),
    sr: Math.round(total * 0.013),
    prr: Math.round(total * 0.007),
    rej: Math.round(total * 0.013),
  }
  n.tx = total - Object.values(n).reduce((s, x) => s + x, 0) // payments fill the rest

  const b = mkBiz(`Test Co ${total.toLocaleString('en-IN')} records`, 'person')
  b.cashOpen = 500000
  b.gpayOpen = 200000
  b.banks = [
    { id: 'hdfc', name: 'HDFC Current', open: 2500000 },
    { id: 'sbi', name: 'SBI Current', open: 1200000 },
  ]
  // plenty of stock to start with so a long run of sales never goes negative
  const it = Object.fromEntries(b.items.map((i) => [i.id, i]))
  Object.assign(it.cu, { open: 3000, openCost: 1400 })
  Object.assign(it.br, { open: 90000, openCost: 2.4 })
  Object.assign(it.mi, { open: 600, openCost: 410 })
  Object.assign(it.mo, { open: 4000, openCost: 120 })
  Object.assign(it.cm, { open: 8000, openCost: 62, rate: 95 })

  // ---- parties
  const FIRM = ['Apex', 'Sunrise', 'Vikram', 'Bharat', 'Lakshmi', 'Kaveri', 'Sri Murugan', 'Orient', 'Delta', 'Precision', 'National', 'Galaxy', 'Royal', 'Metro', 'Ganga', 'Anand', 'Surya', 'Techno', 'Prime', 'Everest']
  const KIND = ['Motors Pvt Ltd', 'Armatures', 'Electricals', 'Engineering Works', 'Rewinders', 'Industries', 'Traders', 'Auto Parts', 'Machines Ltd']
  const PERSON = ['Ramesh Pillai', 'Suresh Kumar', 'Anita Devi', 'Mohan Raj', 'Priya Nair', 'Karthik S', 'Divya R', 'Arun Prakash', 'Meena K', 'Balaji T', 'Gopal V', 'Latha M', 'Senthil N', 'Revathi P', 'Murali D']
  const STATES = ['33', '33', '33', '29', '27', '07', '32']
  const used = new Set()
  const gstin = (st, k) => `${st}AAA${String.fromCharCode(65 + (k % 26))}${String.fromCharCode(65 + ((k * 7) % 26))}${pad(1000 + k, 4)}B1Z${(k % 9) + 1}`
  let g = 0
  const firmName = () => {
    for (;;) {
      const nm = `${pick(FIRM)} ${pick(KIND)}`
      if (!used.has(nm)) return used.add(nm), nm
    }
  }
  const nCust = Math.max(10, Math.round(total / 50)), nSup = Math.max(6, Math.round(total / 120))
  for (let k = 0; k < nCust; k++) {
    const firm = k % 4 !== 3
    const nm = firm ? firmName() : `${pick(PERSON)} ${k}`
    b.cust.push({ id: 'c' + k, name: nm, company: firm, gstin: firm ? gstin(pick(STATES), ++g) : '', phone: '9' + String(int(100000000, 999999999)), address: `${int(1, 99)}, Industrial Estate, Zone ${int(1, 9)}`, open: firm && rnd() < 0.2 ? int(5, 60) * 1000 : 0 })
  }
  for (let k = 0; k < nSup; k++) {
    const firm = k % 3 !== 2
    const nm = firm ? firmName() : `${pick(PERSON)} S${k}`
    b.sup.push({ id: 's' + k, name: nm, company: firm, gstin: firm ? gstin(pick(['33', '33', '29', '27']), ++g) : '', phone: '9' + String(int(100000000, 999999999)), address: `${int(1, 99)}, Market Road`, open: 0 })
  }

  // ---- dates: every document gets a day between 1 Apr and 28 Oct 2026, sorted so numbering follows date
  const START = Date.UTC(2026, 3, 1), DAYS = 211
  const day = (i, count) => new Date(START + Math.min(DAYS - 1, Math.floor((i / count) * DAYS + rnd() * (DAYS / count) * 1.5)) * 864e5).toISOString().slice(0, 10)

  // ---- purchases (raw materials)
  const RAW = [['cu', 1300, 1550, 20, 120], ['br', 2.2, 2.9, 1000, 6000], ['mi', 380, 460, 5, 40], ['mo', 110, 140, 40, 300]]
  for (let i = 0; i < n.pur; i++) {
    const [item, lo, hi, qa, qb] = pick(RAW)
    const s = pick(b.sup)
    b.pur.push({ id: 'p' + i, no: 'PUR-' + pad(i + 1), date: day(i, n.pur), sup: s.id, lines: [{ item, qty: int(qa, qb), rate: r2(lo + rnd() * (hi - lo)) }] })
  }
  // ---- production
  for (let i = 0; i < n.prod; i++) b.prod.push({ id: 'r' + i, date: day(i, n.prod), item: 'cm', qty: int(150, 600) })
  // ---- invoices (firms get INV, persons get BILL, numbered separately)
  let nInv = 0, nBill = 0
  for (let i = 0; i < n.inv; i++) {
    const c = pick(b.cust)
    const lines = [{ item: 'cm', qty: int(10, 120), rate: r2(88 + rnd() * 24) }]
    b.inv.push({ id: 'i' + i, no: c.company ? 'INV-' + pad(++nInv) : 'BILL-' + pad(++nBill), date: day(i, n.inv), cust: c.id, lr: rnd() < 0.3 ? 'LR' + int(10000, 99999) : '', lines })
  }
  // ---- returns, rejects, expenses
  for (let i = 0; i < n.sr; i++) {
    const inv = pick(b.inv)
    b.sr.push({ id: 's_r' + i, no: 'CN-' + pad(i + 1), date: inv.date, inv: inv.id, item: 'cm', qty: int(1, Math.min(20, inv.lines[0].qty)) })
  }
  for (let i = 0; i < n.prr; i++) {
    const p = pick(b.pur)
    b.prr.push({ id: 'd' + i, no: 'DN-' + pad(i + 1), date: p.date, pur: p.id, item: p.lines[0].item, qty: Math.max(1, Math.floor(p.lines[0].qty * 0.02)) })
  }
  for (let i = 0; i < n.rej; i++) b.rej.push({ id: 'j' + i, date: day(i, n.rej), item: 'cm', qty: int(1, 25), note: pick(['Reject', 'Damaged', 'Out of tolerance']) })
  const HEADS = ['Rent', 'Electricity', 'Freight', 'Wages', 'Packing', 'Repairs', 'Fuel', 'Office', 'Insurance']
  for (let i = 0; i < n.exp; i++) {
    const head = pick(HEADS)
    b.exp.push({ id: 'e' + i, date: day(i, n.exp), head, amt: head === 'Rent' ? 25000 : head === 'Wages' ? int(8, 30) * 1000 : int(5, 90) * 100, acct: pick(['hdfc', 'sbi', 'cash', 'gpay']), note: '' })
  }

  // ---- payments: most invoices/purchases are settled (in full or in part); the rest stay open
  const tx = []
  const acctFor = (party) => (party.company ? pick(['hdfc', 'sbi']) : pick(['cash', 'gpay']))
  const wantRecv = Math.round(n.tx * 0.62), wantPay = n.tx - wantRecv
  const invs = [...b.inv], purs = [...b.pur]
  for (let i = 0; i < wantRecv; i++) {
    const doc = invs[i % invs.length]
    const c = b.cust.find((x) => x.id === doc.cust)
    const gross = doc.lines[0].qty * doc.lines[0].rate * (c.company ? 1.18 : 1)
    const share = i < invs.length ? pick([1, 1, 1, 0.5, 0.4]) : 0.1
    tx.push({ id: 't' + tx.length, date: doc.date, kind: 'recv', party: c.id, amt: r2(gross * share), acct: acctFor(c), ref: doc.id })
  }
  for (let i = 0; i < wantPay; i++) {
    const doc = purs[i % purs.length]
    const s = b.sup.find((x) => x.id === doc.sup)
    const gross = doc.lines[0].qty * doc.lines[0].rate * (s.company ? 1.18 : 1)
    const share = i < purs.length ? pick([1, 1, 1, 0.6]) : 0.15
    tx.push({ id: 't' + tx.length, date: doc.date, kind: 'pay', party: s.id, amt: r2(gross * share), acct: acctFor(s), ref: doc.id })
  }
  b.tx = tx.sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0)).map((t, k) => ({ ...t, id: 't' + k }))


  return b
}
