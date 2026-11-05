// Stacking and moulding: the two shop-floor processes behind the Process Scan phone app.
//
//   raw material --(Stacking, outsourced)--> stacked piece --(Moulding, in-house)--> moulded piece
//
// Each stack type (EC, 750 W, Hook) has its own three stock items, so every type is costed on its own:
//   av_<type>   "<Type> at vendor"   raw material sent out and not yet back (unit: pieces expected)
//   stk_<type>  "Stacked <Type>"
//   mld_<type>  "Moulded <Type>"
// A scan (one record from the phone) becomes one stock movement in b.mv; calc.js values it with the same
// moving-average rules as production. Nothing here touches invoices, purchases or payments.
import { find } from './calc.js'
import { valuation } from './calc.js'
import { r2 } from './format.js'

export const TYPES = [
  { id: 'ec', name: 'EC' },
  { id: 'w750', name: '750 W' },
  { id: 'hook', name: 'Hook' },
]
export const PROCESSES = {
  stacking: { name: 'Stacking', outsourced: true, actions: ['issue', 'receive'] },
  moulding: { name: 'Moulding', outsourced: false, actions: ['run'] },
}
export const typeName = (id) => TYPES.find((t) => t.id === id)?.name || id

export const itemId = (kind, type) => `${kind}_${type}` // kind: av | stk | mld

// Bills of materials per piece (amounts are placeholders: set the real ones per type in Inventory).
//   Stacking: copper segments (cu), mica segments (mi) and a plastic bush (pb).
//   Moulding: the stacked piece and moulding compound (mo). The plastic bush is already in the stack.
const BOM = {
  ec: { cu: 0.015, mi: 0.005, pb: 1, mo: 0.03 },
  w750: { cu: 0.022, mi: 0.007, pb: 1, mo: 0.045 },
  hook: { cu: 0.018, mi: 0.006, pb: 1, mo: 0.036 },
}

// Adds the nine stock items a business needs for stacking and moulding if they are missing. Safe to call any
// number of times; never changes an item that exists. Returns true when something was added.
export function ensureProcessItems(b) {
  let added = false
  const has = (id) => b.items.some((i) => i.id === id)
  if (!has('pb')) {
    b.items.push({ id: 'pb', name: 'Plastic bush', type: 'raw', unit: 'pcs', hsn: '3926', open: 0, openCost: 0, rate: 0, bom: [] })
    added = true
  }
  const raw = (id, qty) => (has(id) ? [{ item: id, qty }] : [])
  for (const t of TYPES) {
    const mk = (kind, name, bom) => {
      const id = itemId(kind, t.id)
      if (has(id)) return
      b.items.push({ id, name, type: 'wip', unit: 'pcs', hsn: '', open: 0, openCost: 0, rate: 0, bom })
      added = true
    }
    mk('av', `${t.name} at vendor (stacking)`, [])
    mk('stk', `Stacked ${t.name}`, [...raw('cu', BOM[t.id].cu), ...raw('mi', BOM[t.id].mi), ...raw('pb', BOM[t.id].pb)]) // raw sent per piece
    mk('mld', `Moulded ${t.name}`, [{ item: itemId('stk', t.id), qty: 1 }, ...raw('mo', BOM[t.id].mo)]) // used per piece
  }
  b.mv = b.mv || []
  return added
}

// ------------------------------------------------------------------- QR codes
// One fixed QR per process: "<business tag>|<PROCESS>|<check>". The check only catches a damaged or invented
// code; it is not a secret (a scan still needs a signed-in person, and approval in the main app).
const hash4 = (s) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0').slice(-4)
}
export const bizTag = (bizId) => String(bizId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()
export const qrText = (tag, process) => {
  const p = String(process).toUpperCase()
  return `${tag}|${p}|${hash4(tag + '|' + p)}`
}
// text from a camera -> { tag, process } or null
export function parseQr(text) {
  const m = String(text || '').trim().match(/^([A-Z0-9]{1,6})\|(STACKING|MOULDING)\|([0-9a-f]{4})$/)
  if (!m || hash4(m[1] + '|' + m[2]) !== m[3]) return null
  return { tag: m[1], process: m[2].toLowerCase() }
}

// ----------------------------------------------------------------------- scans
// A scan is one fact reported by the phone. Fields:
//   id (unique, made on the phone)   process 'stacking'|'moulding'   action 'issue'|'receive'|'run'
//   type 'ec'|'w750'|'hook'          date YYYY-MM-DD                 by (who)      at (ISO time)
//   qty        pieces: expected back (issue), good pieces received (receive), good pieces made (run)
//   rejects    pieces rejected (receive, run)
//   lot        stacking lot number, made on the phone at issue and quoted again at receive
//   sup        supplier id of the vendor (stacking)      charge  job-work charge in rupees (receive)
export function scanProblem(s) {
  if (!s || typeof s !== 'object') return 'Not a scan.'
  if (!s.id) return 'The scan has no id.'
  const p = PROCESSES[s.process]
  if (!p) return 'Unknown process.'
  if (!p.actions.includes(s.action)) return `${p.name} has no "${s.action}" step.`
  if (!TYPES.some((t) => t.id === s.type)) return 'Unknown stack type.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return 'The scan has no date.'
  if (!(+s.qty > 0)) return 'The quantity must be more than zero.'
  if (s.rejects != null && !(+s.rejects >= 0)) return 'Rejects cannot be negative.'
  if (s.action === 'issue' && !s.lot) return 'An issue needs a lot number.'
  if (s.action === 'receive' && !s.lot) return 'Choose which lot is coming back.'
  return ''
}

const bomOut = (b, itemIdOf, qty) => (find(b.items, itemIdOf)?.bom || []).map((m) => ({ item: m.item, qty: m.qty * qty }))
const issueOf = (b, lot) => (b.mv || []).find((m) => m.kind === 'issue' && m.lot === lot)

// A scan -> the stock movement it stands for ({ out, in, extra, ... }), or { error }.
export function scanToMovement(b, s) {
  const bad = scanProblem(s)
  if (bad) return { error: bad }
  const q = +s.qty
  const rej = +s.rejects || 0
  const base = { id: s.id, date: s.date, kind: s.action === 'run' ? 'mould' : s.action, type: s.type, by: s.by || '', at: s.at || '', note: s.note || '' }
  if (s.action === 'issue') {
    if (issueOf(b, s.lot)) return { error: `Lot ${s.lot} already exists. Issue again with a new lot number.` }
    return { ...base, lot: s.lot, sup: s.sup || '', expected: q, out: bomOut(b, itemId('stk', s.type), q), in: [{ item: itemId('av', s.type), qty: q }], extra: 0 }
  }
  if (s.action === 'receive') {
    const iss = issueOf(b, s.lot)
    if (!iss) return { error: `Lot ${s.lot} was not issued (or its issue has not been applied yet).` }
    if (iss.type !== s.type) return { error: `Lot ${s.lot} is ${typeName(iss.type)}, not ${typeName(s.type)}.` }
    if ((b.mv || []).some((m) => m.kind === 'receive' && m.lot === s.lot)) return { error: `Lot ${s.lot} has already been received.` }
    return {
      ...base, lot: s.lot, sup: iss.sup, expected: iss.expected, rejects: rej, short: Math.max(0, iss.expected - q - rej),
      out: [{ item: itemId('av', s.type), qty: iss.expected }], in: [{ item: itemId('stk', s.type), qty: q }], extra: r2(+s.charge || 0),
    }
  }
  // moulding run: good + rejected pieces are all used up; only the good ones come out
  return { ...base, rejects: rej, out: bomOut(b, itemId('mld', s.type), q + rej), in: [{ item: itemId('mld', s.type), qty: q }], extra: 0 }
}

// What a scan will do, for the inbox: [{ item, name, qty }] (negative = leaves stock) plus anything wrong.
export function previewScan(b, s) {
  const w = { ...b, items: b.items.map((i) => ({ ...i })), mv: [...(b.mv || [])] }
  ensureProcessItems(w)
  const m = scanToMovement(w, s)
  if (m.error) return { error: m.error }
  const name = (id) => find(w.items, id)?.name || id
  const lines = [...m.out.map((o) => ({ item: o.item, name: name(o.item), qty: -r2(o.qty * 1000) / 1000 })), ...m.in.map((o) => ({ item: o.item, name: name(o.item), qty: +o.qty }))]
  // anything that would take stock below zero
  const have = valuation(w).qty
  const short = m.out.filter((o) => (have[o.item] || 0) < o.qty - 1e-9).map((o) => ({ item: o.item, name: name(o.item), need: o.qty, have: have[o.item] || 0 }))
  return { lines, extra: m.extra, rejects: m.rejects || 0, short: m.short || 0, shortStock: short }
}

// Puts a scan into the books (call inside updB). Same scan twice does nothing. Refuses when stock would go
// below zero unless force is set. Returns { ok: true, mv } or { error, shortStock? }.
export function applyScan(b, s, { force = false } = {}) {
  ensureProcessItems(b)
  if ((b.mv || []).some((m) => m.id === s.id)) return { ok: true, mv: b.mv.find((m) => m.id === s.id), duplicate: true }
  const m = scanToMovement(b, s)
  if (m.error) return { error: m.error }
  if (!force) {
    const have = valuation(b).qty
    const shortStock = m.out.filter((o) => (have[o.item] || 0) < o.qty - 1e-9).map((o) => ({ item: o.item, name: find(b.items, o.item)?.name || o.item, need: o.qty, have: have[o.item] || 0 }))
    if (shortStock.length) return { error: 'Not enough stock: ' + shortStock.map((x) => `${x.name} (need ${r2(x.need)}, have ${r2(x.have)})`).join(', '), shortStock }
  }
  b.mv.push(m)
  return { ok: true, mv: m }
}

// Open stacking lots (issued, not yet received), for the receive screen and the inbox.
export function openLots(b) {
  const done = new Set((b.mv || []).filter((m) => m.kind === 'receive').map((m) => m.lot))
  return (b.mv || []).filter((m) => m.kind === 'issue' && !done.has(m.lot)).map((m) => ({ lot: m.lot, type: m.type, sup: m.sup, expected: m.expected, date: m.date }))
}

// Pairing: the main app shows this once so a phone is linked to one business. It holds no secret; the phone
// still has to sign in with an allowed account.
export const pairText = (bizId) => `PAIR|${bizId}`
export const parsePair = (text) => {
  const m = String(text || '').trim().match(/^PAIR\|([A-Za-z0-9_-]{3,40})$/)
  return m ? m[1] : null
}

// Next lot number for the phone: one more than the highest STK-nnnn it knows of (open lots, its own queue).
export function nextLot(known = []) {
  const n = known.map((l) => +String(l).replace(/^STK-/, '')).filter((x) => x > 0)
  return 'STK-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(4, '0')
}
