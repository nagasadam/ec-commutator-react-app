// Business-kind rules (notes §13). A firm-based business only deals with firms that
// carry a GSTIN and only settles through banks; a person-based one may also use
// persons and Cash/GPay.
import { find } from './calc.js'

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
