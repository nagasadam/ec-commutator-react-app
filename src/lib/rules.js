// Business-kind rules (notes §13). A firm-based business only deals with firms that
// carry a GSTIN and only settles through banks; a person-based one may also use
// persons and Cash/GPay.
import { find, valuation } from './calc.js'

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
export const isFirmBiz = (b) => b.kind === 'firm'

// Returns an error string, or '' when the party may be added.
export function partyError(b, f) {
  const name = (f.name || '').trim()
  if (!name) return 'Enter a name.'
  if (isFirmBiz(b) && !f.company) return 'A firm-based business can only deal with firms (with a GSTIN).'
  const gstin = (f.gstin || '').trim().toUpperCase()
  if (f.company && !GSTIN_RE.test(gstin)) return 'Firms need a valid 15-character GSTIN (e.g. 33AAACA1234B1Z5).'
  return ''
}

// Every document needs a real calendar date (YYYY-MM-DD). Returns an error string, or '' when it is fine.
export function dateError(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return 'Pick a date.'
  const t = new Date(d + 'T00:00:00Z')
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? 'That date does not exist.' : ''
}

// Accounts a party may settle through.
export function settleAccounts(b, party) {
  const banks = b.banks.map((k) => ({ id: k.id, label: k.name }))
  if (isFirmBiz(b)) return banks
  const cg = [
    { id: 'cash', label: 'Cash' },
    { id: 'gpay', label: 'GPay' },
  ]
  if (!party) return [...banks, ...cg]
  return party.company ? banks : cg
}

export function settleError(b, party, acct, amt) {
  if (!party || !(+amt > 0)) return 'Choose a party and an amount.'
  if (!settleAccounts(b, party).some((o) => o.id === acct)) {
    return isFirmBiz(b) || party.company ? 'Firms settle through a bank account.' : 'Persons settle through Cash or GPay.'
  }
  return ''
}

// Switching an existing business to firm-based is refused while it holds data that breaks the rule.
export function kindSwitchError(b, kind) {
  if (kind !== 'firm') return ''
  if ([...b.cust, ...b.sup].some((p) => !p.company)) return 'Remove person customers/suppliers first.'
  if (b.tx.some((t) => t.acct === 'cash' || t.acct === 'gpay')) return 'Cash/GPay receipts or payments exist.'
  return ''
}

export const partyOf = (b, id) => find(b.cust, id) || find(b.sup, id)

// Business names must be unique (ignoring case and surrounding spaces). `exceptId` skips the business being renamed.
export const bizNameTaken = (biz, name, exceptId) => {
  const n = String(name || '').trim().toLowerCase()
  return biz.some((x) => x.id !== exceptId && String(x.name || '').trim().toLowerCase() === n)
}

// ---------- Editing a saved invoice or purchase ----------
// Both return an error string, or '' when the change is allowed. `next` is { party, lines } (lines already cleaned).
const qtyBy = (lines) => {
  const m = {}
  for (const l of lines) m[l.item] = (m[l.item] || 0) + (+l.qty || 0)
  return m
}
const nameOf = (b, id) => find(b.items, id)?.name || 'this item'

function editError(b, doc, next, { partyKey, parties, returns, retKey, what, partyWord }) {
  const was = find(parties, doc[partyKey])
  const now = find(parties, next.party)
  if (!now) return `Pick a ${partyWord}.`
  if (!!was?.company !== !!now.company) return `Switching between a firm and a person changes the ${what} type. Delete it and enter a new one instead.`
  const linked = b.tx.some((t) => t.ref === doc.id) || returns.some((r) => r[retKey] === doc.id)
  if (next.party !== doc[partyKey] && linked) return `Payments or returns are recorded against this ${partyWord}. Remove those first to change the ${partyWord}.`
  const have = qtyBy(next.lines)
  const back = qtyBy(returns.filter((r) => r[retKey] === doc.id))
  for (const id of Object.keys(back)) {
    if ((have[id] || 0) < back[id] - 1e-9) return `${back[id]} of ${nameOf(b, id)} already returned, so this ${what} must keep at least that quantity.`
  }
  return ''
}

export const editInvoiceError = (b, inv, next) => editError(b, inv, next, { partyKey: 'cust', parties: b.cust, returns: b.sr, retKey: 'inv', what: 'invoice', partyWord: 'customer' })

export function editPurchaseError(b, pur, next) {
  const bad = editError(b, pur, next, { partyKey: 'sup', parties: b.sup, returns: b.prr, retKey: 'pur', what: 'purchase', partyWord: 'supplier' })
  if (bad) return bad
  // buying less must not leave stock below zero for something that was not already below zero
  const before = valuation(b).qty
  const w = { ...b, pur: b.pur.map((p) => (p.id === pur.id ? { ...p, sup: next.party, lines: next.lines } : p)) }
  const after = valuation(w).qty
  const short = Object.keys(after).find((k) => after[k] < -1e-9 && after[k] < (before[k] || 0) - 1e-9)
  return short ? `Changing this purchase would leave ${nameOf(b, short)} below zero. Later production or sales already use that stock.` : ''
}
