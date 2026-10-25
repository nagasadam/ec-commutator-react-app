import { mkBiz } from './model.js'

// Demo business built from notes §9 (E.C Commutators test data).
export function demoBiz() {
  const b = mkBiz('EC', 'person')
  b.demo = true
  b.cashOpen = 30000
  b.gpayOpen = 8000
  b.banks = [{ id: 'hdfc', name: 'HDFC Current', open: 250000 }]

  b.items.find((i) => i.id === 'cm').rate = 95

  b.cust = [
    { id: 'apex', name: 'Apex Motors Pvt Ltd', company: true, gstin: '33AAACA1234B1Z5', open: 0 },
    { id: 'sun', name: 'Sunrise Armatures', company: true, gstin: '29AABCS5678C1Z2', open: 15000 },
    { id: 'ram', name: 'Ramesh Pillai', company: false, gstin: '', open: 0 },
  ]
  b.sup = [
    { id: 'ster', name: 'Sterling Copper Pvt Ltd', company: true, gstin: '33AAACS9999D1Z1', open: 0 },
    { id: 'kum', name: 'Kumar Mica Traders', company: false, gstin: '', open: 0 },
  ]

  b.pur = [
    { id: 'p1', no: 'PUR-0001', date: '2026-09-01', sup: 'ster', lines: [{ item: 'cu', qty: 200, rate: 1450 }] },
    { id: 'p2', no: 'PUR-0002', date: '2026-09-02', sup: 'ster', lines: [{ item: 'br', qty: 3000, rate: 2.5 }] },
    { id: 'p3', no: 'PUR-0003', date: '2026-09-03', sup: 'kum', lines: [{ item: 'mi', qty: 15, rate: 420 }] },
    { id: 'p4', no: 'PUR-0004', date: '2026-09-04', sup: 'ster', lines: [{ item: 'mo', qty: 120, rate: 125 }] },
  ]
  b.prod = [{ id: 'r1', date: '2026-09-10', item: 'cm', qty: 2400 }]
  b.inv = [
    { id: 'i1', no: 'INV-0001', date: '2026-09-12', cust: 'apex', lr: '', lines: [{ item: 'cm', qty: 1000, rate: 95 }] },
    { id: 'i2', no: 'INV-0002', date: '2026-09-13', cust: 'sun', lr: '', lines: [{ item: 'cm', qty: 600, rate: 98 }] },
    { id: 'i3', no: 'BILL-0001', date: '2026-09-14', cust: 'ram', lr: '', lines: [{ item: 'cm', qty: 50, rate: 110 }] },
    { id: 'i4', no: 'INV-0003', date: '2026-09-15', cust: 'apex', lr: '', lines: [{ item: 'cm', qty: 500, rate: 95 }] },
  ]
  b.rej = [{ id: 'j1', date: '2026-09-14', item: 'cm', qty: 30, note: 'Reject' }]
  b.sr = [{ id: 's1', no: 'CN-0001', date: '2026-09-16', inv: 'i1', item: 'cm', qty: 40 }]
  b.prr = [{ id: 'd1', no: 'DN-0001', date: '2026-09-17', pur: 'p4', item: 'mo', qty: 10 }]

  b.exp = [
    { id: 'e1', date: '2026-09-05', head: 'Rent', amt: 25000, acct: 'hdfc', note: '' },
    { id: 'e2', date: '2026-09-06', head: 'Electricity', amt: 8200, acct: 'cash', note: '' },
    { id: 'e3', date: '2026-09-07', head: 'Freight', amt: 1800, acct: 'gpay', note: '' },
    { id: 'e4', date: '2026-09-08', head: 'Wages', amt: 12000, acct: 'cash', note: '' },
    { id: 'e5', date: '2026-09-09', head: 'Packing', amt: 2300, acct: 'gpay', note: '' },
  ]

  const tx = (id, date, kind, party, amt, acct, ref = '') => ({ id, date, kind, party, amt, acct, ref })
  b.tx = [
    tx('t1', '2026-09-01', 'pay', 'ster', 342200, 'hdfc', 'p1'), // copper paid from bank
    tx('t2', '2026-09-03', 'pay', 'kum', 6300, 'cash', 'p3'), // mica paid cash
    tx('t3', '2026-09-14', 'recv', 'ram', 3000, 'cash', 'i3'),
    tx('t4', '2026-09-14', 'recv', 'ram', 2500, 'gpay', 'i3'),
    tx('t5', '2026-09-20', 'recv', 'apex', 107616, 'hdfc', 'i1'), // INV-0001 net of credit note
    tx('t6', '2026-09-22', 'recv', 'sun', 36768, 'hdfc', ''),
    tx('t7', '2026-09-25', 'pay', 'ster', 5000, 'hdfc', ''),
  ]
  return b
}

// Figures quoted in notes §9, for the in-app "guide check" and scripts/check-guide.mjs.
export const GUIDE = {
  sales: 203000,
  profit: 89409.28,
  receivable: 103666,
  payable: 20075,
  bankTotal: 22184,
  cash: 6500,
  gpay: 6400,
  closingStock: 253259.28,
  gstOut: 35550,
  gstIn: 56025,
}
