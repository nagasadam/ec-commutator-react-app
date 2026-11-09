// PDF import, steps 3 and 4: match the parsed text against the business, build the draft, and write the records.
import { find, valuation } from '../calc.js'
import { nextNo } from '../model.js'
import { partyError } from '../rules.js'
import { uid } from '../format.js'
import { readInvoiceQr } from '../qr.js'
import { extractLines } from './extract.js'
import { gstinCheck, parseDocument } from './parse.js'

// -------------------------------------------------------------------- matching
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\b(m\/s|pvt|private|ltd|limited|llp|the)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const words = (s) => norm(s).split(' ').filter((w) => w.length > 1).map((w) => w.replace(/s$/, ''))

export const aliasKey = (s) => norm(s || '')

export function matchParty(list, p, alias) {
  if (!p) return null
  const a = alias && alias[aliasKey(p.name)]
  if (a) {
    const hit = list.find((x) => x.id === a)
    if (hit) return hit
  }
  if (p.gstin) {
    const g = list.find((x) => (x.gstin || '').toUpperCase() === p.gstin.toUpperCase())
    if (g) return g
  }
  const n = norm(p.name)
  if (!n) return null
  return list.find((x) => norm(x.name) === n) || null
}

export function matchItem(items, desc, hsn = '', alias) {
  const d = norm(desc)
  const a = d && alias && alias[d]
  if (a) {
    const hit = items.find((i) => i.id === a)
    if (hit) return hit
  }
  if (d) {
    const exact = items.filter((i) => norm(i.name) === d)
    if (exact.length === 1) return exact[0]
    const contain = items.filter((i) => d.includes(norm(i.name)) || norm(i.name).includes(d))
    if (contain.length === 1) return contain[0]
    const dw = new Set(words(desc))
    const scored = items.map((i) => ({ i, n: words(i.name).filter((w) => dw.has(w)).length })).filter((x) => x.n > 0)
    scored.sort((a, c) => c.n - a.n)
    if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return scored[0].i
  }
  if (hsn) {
    const byHsn = items.filter((i) => i.hsn && (hsn.startsWith(i.hsn) || i.hsn.startsWith(hsn)))
    if (byHsn.length === 1) return byHsn[0]
  }
  return null
}

// Turn parsed text into something the forms can show. mode: 'sale' | 'purchase'.
export function buildDraft(b, parsed, mode) {
  const list = mode === 'sale' ? b.cust : b.sup
  const pool = mode === 'sale' ? b.items : b.items.filter((i) => i.type === 'raw')
  const al = (b.alias || {})
  const found = matchParty(list, parsed.party, al[mode === 'sale' ? 'cust' : 'sup'])
  const p = parsed.party
  const firmBiz = b.kind === 'firm'
  return {
    mode,
    party: found ? found.id : p ? '__new__' : '',
    newParty: !found && p ? { name: p.name, gstin: p.gstin, phone: p.phone, address: p.address, company: firmBiz ? true : p.company } : null,
    date: parsed.date || '',
    dateFound: !!parsed.date,
    total: parsed.total || 0,
    billName: p ? p.name : '',
    lr: parsed.lr || '',
    lrDate: parsed.lrDate || '',
    transporter: parsed.transporter || '',
    supply: parsed.supply,
    rows: parsed.rows.map((r) => ({ desc: r.desc, qty: r.qty, rate: r.rate, item: (matchItem(pool, r.desc, r.hsn, al.item) || {}).id || '' })),
  }
}

const sig = (lines) => lines.map((l) => `${l.item}|${+l.qty}|${+l.rate}`).sort().join(';')

// Cross-check: the bill's printed total should equal the rows plus GST at a standard rate (small round-off allowed).
export function totalIssue(d) {
  if (!(d.total > 0)) return ''
  const base = d.rows.reduce((t, r) => t + r.qty * r.rate, 0)
  const ok = [0, 5, 12, 18, 28].some((g) => Math.abs(base * (1 + g / 100) - d.total) <= Math.max(2, d.total * 0.002))
  return ok ? '' : `The bill total (${d.total.toLocaleString('en-IN')}) does not match the item rows (${Math.round(base).toLocaleString('en-IN')} before GST). Something may be missed, such as freight or another item.`
}

// Remember how the person matched bill text, so the same wording is matched the same way next time. Call inside updB.
export function learnAliases(x, mode, d, partyId, rowItems) {
  x.alias = x.alias || { item: {}, sup: {}, cust: {} }
  const pk = mode === 'sale' ? 'cust' : 'sup'
  x.alias[pk] = x.alias[pk] || {}
  x.alias.item = x.alias.item || {}
  const pn = d && d.newParty ? d.newParty.name : d && d.partyName
  if (partyId && partyId !== '__new__' && pn && aliasKey(pn)) x.alias[pk][aliasKey(pn)] = partyId
  ;(rowItems || []).forEach((r) => {
    if (r && r.desc && r.item && aliasKey(r.desc)) x.alias.item[aliasKey(r.desc)] = r.item
  })
}

// Reasons automatic saving must not happen (empty = safe to save).
export function autoSaveIssues(b, d) {
  const why = []
  const sale = d.mode === 'sale'
  if (!d.party) why.push(sale ? 'No customer was found.' : 'No supplier was found.')
  if (d.party === '__new__') {
    const e = partyError(b, d.newParty || {})
    if (e) why.push(e.startsWith('Firms need') ? `The new ${sale ? 'customer' : 'supplier'} is a firm but no GSTIN was found.` : e)
  }
  if (!d.dateFound) why.push('No date was found.')
  if (!d.rows.length) why.push('No item rows were found.')
  d.rows.forEach((r, i) => {
    if (!r.item) why.push(`Row ${i + 1} ("${r.desc || 'no description'}") did not match a ${sale ? 'product' : 'raw material'}.`)
    if (!(r.qty > 0) || !(r.rate > 0)) why.push(`Row ${i + 1} is missing a quantity or rate.`)
  })
  if (why.length) return why
  const tot = totalIssue(d)
  if (tot) return [tot]

  if (d.party !== '__new__') {
    const lines = d.rows.map((r) => ({ item: r.item, qty: r.qty, rate: r.rate }))
    if (sale) {
      if (b.inv.some((i) => i.cust === d.party && i.date === d.date && sig(i.lines) === sig(lines))) why.push('An identical invoice already exists (same customer, date, items, quantities and rates).')
    } else if (lines.every((l) => b.pur.some((p) => p.sup === d.party && p.date === d.date && p.lines.length === 1 && sig(p.lines) === sig([l])))) {
      why.push('Identical purchases already exist (same supplier, date, items, quantities and rates).')
    }
  }
  if (sale) {
    const have = valuation(b).qty
    const need = {}
    d.rows.forEach((r) => (need[r.item] = (need[r.item] || 0) + r.qty))
    for (const [id, q] of Object.entries(need)) if (q > (have[id] || 0)) why.push(`Not enough stock of ${find(b.items, id)?.name} (need ${q}, have ${have[id] || 0}).`)
  }
  return why
}

// ------------------------------------------------------------------- writing
// Both functions mutate the business object `x` (call inside updB). A new party is added first.
export function ensureParty(x, kind, d) {
  if (d.party !== '__new__') return d.party
  const n = d.newParty
  const id = uid()
  x[kind].push({ id, name: n.name.trim(), company: !!n.company, gstin: n.company ? n.gstin.trim().toUpperCase() : '', phone: n.phone || '', address: n.address || '', open: 0 })
  return id
}

export function addInvoice(x, d) {
  const cust = ensureParty(x, 'cust', d)
  const c = find(x.cust, cust)
  const inv = { id: uid(), no: nextNo(x.inv, c.company ? 'INV-' : 'BILL-'), date: d.date, cust, lr: (d.lr || '').trim(), lines: d.lines }
  if (d.transporter) inv.transporter = d.transporter
  x.inv.push(inv)
  return inv
}

// One purchase per row, recorded as Pay later.
export function addPurchases(x, d, rows) {
  const sup = ensureParty(x, 'sup', d)
  return rows.map((r) => {
    const p = { id: uid(), no: nextNo(x.pur, 'PUR-'), date: d.date, sup, lines: [{ item: r.item, qty: +r.qty, rate: +r.rate }] }
    x.pur.push(p)
    return p
  })
}

// "Rate includes GST" -> rate before GST (firms only; persons carry no GST).
export const exclGst = (rate, company) => (company ? Math.round((+rate / 1.18) * 10000) / 10000 : +rate)

// One PDF, start to finish. getB() must return the CURRENT business (fresh after earlier saves),
// updB(fn) applies a change. With auto on and nothing blocking, the records are created and the
// result is { status: 'saved', nos, who, isNew }. Otherwise { status: 'review', draft, issues }
// so the caller can fill the form. `mark` ({ id, name }) records a Drive file as imported in the
// same change that saves it, so a crash can never leave one without the other.
// The e-invoice QR (see qr.js) names the supplier's GSTIN and the invoice date exactly: use them over what text
// recognition made of the same printed numbers. Returns a sentence for the review box, or ''.
export function applyQr(parsed, qr, mode) {
  if (!qr) return ''
  const g = mode === 'purchase' ? qr.sellerGstin : qr.buyerGstin
  const valid = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g || '') && gstinCheck(g.slice(0, 14)) === g[14]
  const got = []
  if (valid) {
    if (parsed.party) parsed.party.gstin = g
    else parsed.party = { name: '', gstin: g, phone: '', address: '', company: true }
    got.push(mode === 'purchase' ? 'supplier GSTIN' : 'customer GSTIN')
  }
  if (qr.date) {
    parsed.date = qr.date
    got.push('invoice date')
  }
  if (!got.length) return ''
  return `The ${got.join(' and ')} came from the bill's QR code${qr.docNo ? ` (invoice no. ${qr.docNo}${qr.total ? ', total ' + qr.total : ''})` : ''}.`
}

export async function importFile(file, { mode, getB, updB, auto, mark, pdfjs, onProgress, ocrPage, ocrImage, readQr }) {
  const lines = await extractLines(file, pdfjs, { onProgress, ocrPage, ocrImage })
  const parsed = parseDocument(lines, mode)
  const qrNote = lines.photo ? applyQr(parsed, await (readQr || readInvoiceQr)(file), mode) : ''
  const d = buildDraft(getB(), parsed, mode)
  const issues = autoSaveIssues(getB(), d)
  // Text recognition can misread a digit, so a scan or a photo is never saved without a human check.
  if (lines.ocr) issues.unshift(lines.photo ? 'This is a photo of a bill. Its text was read by text recognition and can contain mistakes, so check every field before saving.' : 'This PDF is a scanned image. Its text was read by text recognition and can contain mistakes, so check every field before saving.')
  if (qrNote) issues.push(qrNote)
  if (!(auto && !issues.length)) return { status: 'review', draft: d, issues }
  let made
  updB((x) => {
    made = mode === 'sale' ? [addInvoice(x, { ...d, lines: d.rows.map((r) => ({ item: r.item, qty: r.qty, rate: r.rate })) })] : addPurchases(x, d, d.rows)
    if (mark) markImported(x, mark, mode, made.map((m) => m.no).join(', '))
  })
  return { status: 'saved', nos: made.map((m) => m.no), who: d.party === '__new__' ? d.newParty.name : (mode === 'sale' ? getB().cust : getB().sup).find((p) => p.id === d.party)?.name, isNew: d.party === '__new__' }
}

export function markImported(x, mark, mode, ref = '') {
  if (!x.dimp.some((m) => m.id === mark.id)) x.dimp.push({ id: mark.id, kind: mode, name: mark.name, at: new Date().toISOString().slice(0, 10), ref })
}
