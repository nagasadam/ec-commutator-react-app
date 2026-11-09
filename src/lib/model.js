import { uid } from './format.js'

// Arrays every business must carry. Add new ones here so old saved data
// is migrated by fixBiz and new businesses start with them.
export const ARRAYS = ['items', 'inv', 'banks', 'tx', 'pur', 'prod', 'cust', 'sup', 'exp', 'sr', 'prr', 'rej', 'pp', 'dimp', 'mv', 'jw']

export const defaultItems = () => [
  { id: 'cu', name: 'Copper coil', type: 'raw', unit: 'kg', hsn: '7408', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'br', name: 'Brass insert', type: 'raw', unit: 'pcs', hsn: '7419', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'mi', name: 'Mica', type: 'raw', unit: 'kg', hsn: '2525', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'mo', name: 'Moulding powder', type: 'raw', unit: 'kg', hsn: '3907', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'pb', name: 'Plastic bush', type: 'raw', unit: 'pcs', hsn: '3926', open: 0, openCost: 0, rate: 0, bom: [] },
  {
    id: 'cm',
    name: 'Commutator',
    type: 'fg',
    unit: 'pcs',
    hsn: '8503',
    open: 0,
    openCost: 0,
    rate: 0,
    // quantity of each raw item used per finished piece (editable in Inventory)
    bom: [
      // Placeholder BOM: the notes don't state the real one. Copper qty is calibrated so
      // the §9 demo reproduces the guide's closing stock and profit. Replace with your own.
      { item: 'cu', qty: 0.01496027 },
      { item: 'br', qty: 1 },
      { item: 'mi', qty: 0.005 },
      { item: 'mo', qty: 0.03 },
    ],
  },
]

export function mkBiz(name = 'My Business', kind = 'person') {
  const b = { id: uid(), name, kind, stateCode: '33', cashOpen: 0, gpayOpen: 0 }
  ARRAYS.forEach((k) => (b[k] = []))
  b.items = defaultItems()
  b.drive = { sale: '', purchase: '' }
  return b
}

// Additive migration: never remove or rename fields here.
export function fixBiz(b) {
  ARRAYS.forEach((k) => (b[k] = b[k] || []))
  b.cashOpen = b.cashOpen || 0
  b.gpayOpen = b.gpayOpen || 0
  b.kind = b.kind || 'person'
  // Google Drive folders to import PDFs from (one for invoices, one for purchases)
  b.drive = { sale: '', purchase: '', ...(b.drive || {}) }
  b.stateCode = b.stateCode || '33'
  // Remembered corrections from bill imports: normalised bill text -> id
  b.alias = { ...(b.alias || {}) }
  ;['item', 'sup', 'cust'].forEach((k) => (b.alias[k] = b.alias[k] || {}))
  // Plastic bush is used in stacking (see process.js); add it where it is missing so it can be bought straight away
  if (!b.items.some((i) => i.id === 'pb')) b.items.push({ id: 'pb', name: 'Plastic bush', type: 'raw', unit: 'pcs', hsn: '3926', open: 0, openCost: 0, rate: 0, bom: [] })
  // Process Scan: scans wait for approval unless this is switched off
  b.pscan = { approve: true, ...(b.pscan || {}) }
  // job-work rate per stacked piece, by stack type (rupees; no GST on job work)
  b.pscan.rates = { ec: 0, w750: 0, hook: 0, ...(b.pscan.rates || {}) }
  b.alias = { item: {}, sup: {}, cust: {} }
  return b
}

// One more than the highest number already used with this prefix, so deleting a document never hands its number out again.
export const nextNo = (list, prefix, field = 'no') => {
  let top = 0
  for (const x of list) {
    const s = String(x[field] || '')
    if (!s.startsWith(prefix)) continue
    const n = parseInt(s.slice(prefix.length), 10)
    if (n > top) top = n
  }
  return `${prefix}${String(top + 1).padStart(4, '0')}`
}
