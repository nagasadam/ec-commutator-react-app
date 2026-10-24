import { uid } from './format.js'

// Arrays every business must carry. Add new ones here so old saved data
// is migrated by fixBiz and new businesses start with them.
export const ARRAYS = ['items', 'inv', 'banks', 'tx', 'pur', 'prod', 'cust', 'sup', 'exp', 'sr', 'prr', 'rej', 'pp', 'dimp']

export const defaultItems = () => [
  { id: 'cu', name: 'Copper coil', type: 'raw', unit: 'kg', hsn: '7408', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'br', name: 'Brass insert', type: 'raw', unit: 'pcs', hsn: '7419', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'mi', name: 'Mica', type: 'raw', unit: 'kg', hsn: '2525', open: 0, openCost: 0, rate: 0, bom: [] },
  { id: 'mo', name: 'Moulding powder', type: 'raw', unit: 'kg', hsn: '3907', open: 0, openCost: 0, rate: 0, bom: [] },
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
  return b
}

export const nextNo = (list, prefix, field = 'no') =>
  `${prefix}${String(list.filter((x) => String(x[field] || '').startsWith(prefix)).length + 1).padStart(4, '0')}`
