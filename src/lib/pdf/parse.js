// PDF import, step 2: text lines -> { party, date, supply, lr, transporter, rows }. Pure text work, no business data.

// ------------------------------------------------------------------- parsing
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/
// The 15th character of a GSTIN is a check character of the first 14.
const G36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function gstinCheck(g14) {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const p = G36.indexOf(g14[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(p / 36) + (p % 36)
  }
  return G36[(36 - (sum % 36)) % 36]
}
const GST_LABEL = /\bGSS?T\s*IN\b|\bGST\s*(?:no|number|\/)/i
const DIGITISH = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' }

// A GSTIN from text. An exact match is used as it is. Text recognition garbles these ids
// ("20AABCM1411F1ZG" came out as "Z2OAABCM1411F12Z2G"), so after a GSTIN label the state code and the
// PAN are read loosely and the last three characters are rebuilt so that the check character agrees.
// An id that does not satisfy its own check character is never invented.
export function findGstin(text) {
  const strict = String(text).match(new RegExp(GSTIN_RE.source, 'g')) || []
  const good = strict.find((g) => gstinCheck(g.slice(0, 14)) === g[14])
  if (good || strict.length) return good || strict[0]
  for (const line of String(text).split('\n')) {
    const lab = line.match(GST_LABEL)
    if (!lab) continue
    const clean = line.slice(lab.index + lab[0].length).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const pan = clean.match(/[A-Z]{5}\d{4}[A-Z]/)
    if (!pan || pan.index < 2) continue
    const st = clean.slice(pan.index - 2, pan.index).replace(/./g, (c) => DIGITISH[c] || c)
    if (!/^\d\d$/.test(st)) continue
    const rest = clean.slice(pan.index + 10)
    for (const ent of '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const g14 = st + pan[0] + ent + 'Z'
      const chk = gstinCheck(g14)
      const e = rest.indexOf(ent)
      const z = e >= 0 ? rest.indexOf('Z', e + 1) : -1
      if (e >= 0 && z >= 0 && rest.indexOf(chk, z + 1) >= 0) return g14 + chk
    }
  }
  return ''
}
const hasGst = (l) => GSTIN_RE.test(l) || GST_LABEL.test(l)
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n) => String(n).padStart(2, '0')

// First date in a string as YYYY-MM-DD, or ''.
export function findDate(s) {
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) return ok(m[1], m[2], m[3])
  m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (m) return ok(m[3], m[2], m[1])
  m = s.match(/(?<![\d./-])(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?![\d./-])/)
  if (m) return ok('20' + m[3], m[2], m[1]) // "10-10-26"
  m = s.match(/\b(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*\.?,?[\s-]+(\d{4}|\d{2})\b/)
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    if (mi >= 0) return ok(m[3].length === 2 ? '20' + m[3] : m[3], mi + 1, m[1]) // "5-Jun-26"
  }
  return ''
  function ok(y, mo, d) {
    return +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : ''
  }
}

const TITLE_RE = /^(tax\s*invoice|invoice|bill\s*of\s*supply|original|duplicate|triplicate|original\s*(copy|for.*)|duplicate\s*(copy|for.*)|e-?invoice|copy|irn\b.*|ack\b.*|page\s*\d.*|\(?\s*(original|duplicate|triplicate)\s*\)?)$/i
const SALE_LABEL = /^(?:to\b|bill(?:ed)?\s*to\b|buyer\b|customer\b|sold\s*to\b|consignee\b|m\/s\b)\s*[,:\-.]?\s*(?:\([^)]*\))?\s*[:-]?\s*(.*)$/i
const PUR_LABEL = /^(?:from\b|supplier\b|seller\b|vendor\b|sold\s*by\b|billed\s*from\b)\s*[,:\-.]?\s*(?:\([^)]*\))?\s*[:-]?\s*(.*)$/i
const STOP_RE = /^(sl\.?\s*no|s\.?\s*no|sr\.?\s*no|description|particulars|ship(?:ped)?\s*to|invoice\s*(no|date)|place\s*of\s*supply|name\s*of\s*(the\s*)?transport|transporter|l\.?r\.?\s*no|bank\b|delivery)/i
const PHONE_RE = /(?:ph(?:one)?(?:\s*no)?|mob(?:ile)?(?:\s*no)?|tel|contact|cell)\.?\s*[:-]?\s*(\+?[\dO][\dO\s-]{8,14}\d)/i
const FIRM_WORDS = /\b(pvt|private|ltd|limited|llp|industries|industry|enterprises?|engineering|engg|works|traders?|motors?|company|co|corporation|corp|associates|& sons|brothers|bros|agencies|electricals?|electric|industrial(?!\s+(?:estate|area|park|zone|layout|development))|solutions?|systems|enterprise|suppliers?|marketing|chemicals?|plastics?|polymers?|metals?|steels?|exports?|electronics|polytech)\b/i

// "BUYER DELIVERED ADDRESS: Same as in the customer name" is a delivery note, not part of the customer.
const DELIV_RE = /\(?\s*(?:buyer\s*)?(?:deliver(?:ed|y)|ship(?:ped|ping)?)\s*(?:to\s*)?(?:address)?\s*\)?\s*[:-]?.*$/i
const isDeliv = (l) => /^\(?\s*(?:buyer\s*)?(?:deliver(?:ed|y)|ship(?:ped|ping)?)\s*(?:to|address)/i.test(l)
const noDeliv = (l) => l.replace(DELIV_RE, '').trim()

// Text from the next column of a two-column header ("ACME LTD. Invoice No. e-Way Bill No.") that
// the reader put on the same line. It is never part of the party.
const RIGHT_COL = /\s+(?:invoice\s*no|e-?way|delivery\s*note|mode\/?\s*terms|reference\s*no|buyer'?s?\s*order|dispatch|other\s*ref|dated)\b.*$/i
// Text recognition puts stray marks at the start of a line ("@ ASHOK ...", "Ee To,(BUYER") and a lone letter or
// quote at the end ("... WORKS i\""): neither is part of the text.
const HONOR = /^(?:to|by|m\/s|mr|ms|mrs|dr|sri|shri|smt)$/i
function lead(s) {
  let t = s.replace(/^[^\w(]+/, '')
  for (;;) {
    const m = t.match(/^(\S{1,2})\s+(?=\S)/)
    if (!m || HONOR.test(m[1].replace(/[,.:]+$/, '')) || /^[A-Z]{1,2}$/.test(m[1]) || /\d/.test(m[1])) return t
    t = t.slice(m[0].length).replace(/^[^\w(]+/, '')
  }
}
const trail = (s) => s.replace(/(?:\s+(?:[a-z]|[^\w\s.)]))+["'\u201d]?\s*$/, '')
const cleanName = (s) =>
  trail(lead(noDeliv(s)))
    .replace(RIGHT_COL, '')
    .replace(/^m\/s\.?\s*/i, '')
    .replace(/\s*(gstin|gst\s*no|gst|ph|phone|mob|mobile|tel)\b.*$/i, '')
    .replace(/[,;:\s]+$/, '')
    .trim()

function readBlock(lines, i, first, max = 8) {
  const out = first ? [first] : []
  for (let k = i + 1; k < lines.length && out.length < max; k++) {
    const l = lines[k]
    // "BUYER DELIVERED ADDRESS: Same as billed address." sits beside the billed block, so on a photo it can fall between
    // its lines: step over it when it says "same as" (the billed block goes on), end the block when it has its own address.
    if (isDeliv(l) && /same\s*as/i.test(l)) continue
    if (!l || isDeliv(l) || STOP_RE.test(l) || (SALE_LABEL.test(l) && /^(to|buyer|customer|sold|consignee|bill)/i.test(l) && out.length)) break
    const c = noDeliv(l).replace(RIGHT_COL, '').replace(/\s+billed\s+address\.?$/i, '').trim() // end of a wrapped "...Same as billed address" note
    if (c) out.push(c)
  }
  return out
}

// Purchase invoices rarely say "From:". The seller is the party at the top of the page, so find the
// first GSTIN that is not in a Buyer / Consignee block and take the nearest firm-like line above it.
function sellerLine(lines) {
  const BUYER = /^(consignee|buyer|bill\s*to|ship\s*to|to\s*[,:])/i
  for (let i = 0; i < lines.length; i++) {
    if (!hasGst(lines[i]) || isDeliv(lines[i])) continue
    let buyer = false
    for (let k = i - 1; k >= Math.max(0, i - 8); k--) if (BUYER.test(lines[k])) buyer = true
    if (buyer) continue
    const firm = (k) => {
      const n = cleanName(lines[k])
      return !!n && FIRM_WORDS.test(n) && !TITLE_RE.test(n) && !/^(irn|ack|invoice|e-?way)\b/i.test(n)
    }
    for (let k = i; k >= Math.max(0, i - 10); k--) if (firm(k)) return k
    // Some bills print "GST No: ..." as the very first line and the firm's name under it (after the "TAX INVOICE" title).
    if (i < 3) for (let k = i + 1; k <= Math.min(lines.length - 1, i + 4); k++) if (firm(k) && !hasGst(lines[k])) return k
    return -1
  }
  return -1
}

function partyFromBlock(block) {
  if (!block.length) return null
  const name = cleanName(block[0])
  if (!name) return null
  const text = block.join('\n')
  const gstin = findGstin(text)
  const phone = ((text.match(PHONE_RE) || [])[1] || '').replace(/[\s-]/g, '').replace(/O/g, '0')
  const gIdx = block.findIndex(hasGst)
  const addr = block
    .slice(1, gIdx > 0 ? gIdx : undefined)
    .filter((l) => !PHONE_RE.test(l) && !/^(gstin|gst\s*no|state|pan|udyam|cin|e-?mail|www|terms\s*of|ex-|billed\s*address)\b/i.test(l) && !/same\s*as\b/i.test(l))
    .filter((l) => !/\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{9,}\b/.test(l)) // an invoice number / date from the next column
    .filter((l) => !TITLE_RE.test(l.replace(/,\s*$/, '')))
    .map((l) => l.replace(/^address\s*[:.-]?\s*/i, '').replace(/\s*e-?mail\s*:.*$/i, '').trim())
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ',')
    .trim()
  return { name, gstin, phone, address: addr, company: !!gstin || FIRM_WORDS.test(name) }
}

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g
const toNum = (s) => parseFloat(String(s).replace(/,/g, ''))
const UNITS = /\b(nos?|pcs?|pieces?|kgs?|kg|qty|units?|sets?|mtrs?|meters?|ltrs?|litres?|gms?)\b\.?/gi

// Find q, r, t in order with q * r = t (the taxable value).
function triple(nums) {
  for (let k = nums.length - 1; k >= 2; k--) {
    for (let i = 0; i < k - 1; i++) {
      for (let j = i + 1; j < k; j++) {
        const q = nums[i]
        const r = nums[j]
        const t = nums[k]
        if (q > 0 && r > 0 && t > 0 && Math.abs(q * r - t) <= Math.max(0.02, t * 0.002)) return { qty: q, rate: r, taxable: t }
      }
    }
  }
  return null
}

// Text recognition sometimes drops one column (the rate, or the HSN). With a quantity and a taxable value the
// rate follows, and it is trusted only when a tax figure on the same row agrees (5, 12, 18 or 28 % of the
// taxable value, or half of it for CGST / SGST).
function pair(nums) {
  for (let i = 0; i < nums.length - 1; i++) {
    for (let k = i + 1; k < nums.length; k++) {
      const q = nums[i]
      const t = nums[k]
      const r = t / q
      if (!(q > 0 && t > q) || Math.abs(r * 100 - Math.round(r * 100)) > 1e-6) continue
      const taxed = nums.some((x, j) => j > k && [0.05, 0.12, 0.18, 0.28, 0.025, 0.06, 0.09, 0.14].some((g) => Math.abs(x - t * g) <= Math.max(0.5, t * g * 0.002) || Math.abs(x - t * (1 + g)) <= Math.max(0.5, t * (1 + g) * 0.002)))
      if (taxed) return { qty: q, rate: r, taxable: t }
    }
  }
  return null
}

function parseRow(text) {
  const s = text
    .replace(/\(\s*\d{4,8}\s*\)(?=\s+\d{4,8}\b)/, '') // "Mica Rifted Into Sheets (681410) 68141090": the full HSN comes next
    .replace(/^\s*\d{1,3}[.)]?\s+(?=[A-Za-z])/, '')
    // "1 05 CTNS Mica ..." : serial number and package count come before the description
    .replace(/^\s*(?:\d{1,3}[.)]?\s+)?\d+\s*(?:ctns?|cartons?|bags?|boxes|box|pkgs?|bundles?|rolls?|drums?|cases?)\.?\s+(?=[A-Za-z])/i, '')
  // A size or rating belongs to the description ("fiberglass 3 mm chapped strand", "Commutator 750 W"), not to the numbers.
  let firstNum = s.search(/\d/)
  for (let g = 0; g < 3 && firstNum > 0; g++) {
    const spec = s.slice(firstNum).match(/^\d+(?:\.\d+)?\s*(?:mm|cm|inch|gsm|micron|swg|kw|hp|amps?|w|v)\b[\sA-Za-z.-]*?(?=\s*\d|$)/i)
    if (!spec) break
    const next = s.slice(firstNum + spec[0].length).search(/\d/)
    if (next < 0) break
    firstNum += spec[0].length + next
  }
  const desc = (firstNum > 0 ? s.slice(0, firstNum) : '').replace(UNITS, '').replace(/[\s,;:|(-]+$/, '').replace(/^(?:[^\w(]+|[a-z]{1,2}\s+(?=[A-Za-z]{3,}))+/, '').trim() // stray marks / a lone "om" before the words
  const rest = firstNum >= 0 ? s.slice(firstNum) : ''
  const hsnM = rest.match(/^\d{4,8}\b(?!\.)/)
  const hsn = hsnM ? hsnM[0] : ''
  const nums = (rest.replace(UNITS, ' ').match(NUM_RE) || []).map(toNum).filter((n) => !isNaN(n))
  const body = hsn ? nums.slice(1) : nums
  let t = triple(body) || triple(nums) || pair(body)
  if (!t && (t = pair(nums)) && hsn && +hsn === t.qty) return { desc, hsn: '', ...t } // the quantity was read as the HSN
  if (t) return { desc, hsn, ...t }
  // fallback: a quantity followed by a unit word, then a rate
  const qm = rest.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:nos?|pcs?|kgs?|units?|sets?)\b\.?\s*(\d[\d,]*(?:\.\d+)?)?/i)
  return { desc, hsn, qty: qm ? toNum(qm[1]) : null, rate: qm && qm[2] ? toNum(qm[2]) : null, taxable: null }
}

// A line that holds the taxable value and, after it, tax amounts. Half-rate amounts twice (9 % + 9 % of the taxable
// value) is CGST + SGST; one full-rate amount (18 %) is IGST. Returns 'intra', 'inter' or ''.
function taxFromRow(lines, taxable) {
  const near = (a, b) => Math.abs(a - b) <= Math.max(1.01, b * 0.002)
  for (const l of lines) {
    const nums = (l.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => parseFloat(n.replace(/,/g, '')))
    const at = nums.findIndex((n) => near(n, taxable) || near(n * 1, taxable))
    if (at < 0) continue
    const rest = nums.slice(at + 1)
    for (const r of [2.5, 6, 9, 14]) if (rest.filter((a) => near(a, (taxable * r) / 100)).length >= 2) return 'intra'
    for (const r of [5, 12, 18, 28]) if (rest.some((a) => near(a, (taxable * r) / 100))) return 'inter'
  }
  return ''
}
// Does a line carry an amount after the tax label ("CGST@ 5400.00")? A rate alone ("IGST @ 18%") is not an amount.
function hasTaxAmount(lines, word) {
  const re = new RegExp('\\b' + word + '\\b', 'i')
  return lines.some((l) => {
    const m = l.match(re)
    if (!m) return false
    const after = l.slice(m.index + m[0].length).replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    return (after.match(/\d[\d,]*(?:\.\d+)?/g) || []).some((n) => parseFloat(n.replace(/,/g, '')) > 0)
  })
}
export function parseDocument(rawLines, mode = 'sale') {
  const lines = rawLines
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => {
      // stray marks before a label: "Ee To,(BUYER BILLED ADDRESS)", "E To,(BUYER ..."
      const m = l.match(/^(?:\S{1,2}\s+)+(?=(?:to\b|bill|buyer|consignee|customer|sold|m\/s|from\b|supplier|seller|vendor))/i)
      return m ? l.slice(m[0].length) : l
    })
  const joined = lines.join('\n')

  // supply type from the tax columns
  // A bill that prints all three tax labels but fills in only CGST and SGST (or only IGST) is told apart by the amounts.
  const taxAmt = (w) => hasTaxAmount(lines, w)
  let weakSupply = false
  let supply = taxAmt('IGST') && !(taxAmt('CGST') && taxAmt('SGST')) ? 'inter' : taxAmt('CGST') && taxAmt('SGST') && !taxAmt('IGST') ? 'intra' : /\bIGST\b/i.test(joined) ? 'inter' : /\bCGST\b/i.test(joined) && /\bSGST\b/i.test(joined) ? 'intra' : null
  weakSupply = !(taxAmt('IGST') || (taxAmt('CGST') && taxAmt('SGST')))
  if (!supply) {
    // two different "state code" values (seller 36, buyer 07) mean the sale crosses a state border
    const codes = [...joined.matchAll(/state\s*code\s*[:-]?\s*(\d{2})\b/gi)].map((m) => m[1])
    if (codes.length >= 2) supply = codes.every((c) => c === codes[0]) ? 'intra' : 'inter'
  }

  // date: the invoice date, never a date of supply / due date / order date
  let date = ''
  for (let i = 0; i < lines.length && !date; i++) {
    const l = lines[i]
    if (/(supply|due|order|p\.?o\.?\b|lr\b|l\.r|lorry|dispatch|ack|vehicle|challan)/i.test(l) && !/invoice\s*date/i.test(l)) continue
    if (/(invoice|inv\.?|bill)\s*date|^date\b|\bdate\b|\bdated\b/i.test(l)) date = findDate(l) || (/dated?\s*[:-]?\s*$/i.test(l) ? findDate(lines[i + 1] || '') : '')
  }

  // the supplier's own invoice number: "Invoice No.: 123", "Bill No 45/26-27"; never an e-way bill / order / challan number
  let billNo = ''
  const tok = (t) => (t.match(/^([A-Za-z0-9][A-Za-z0-9\/\-.]{0,24})(?=\s|$)/) || [])[1] || ''
  const okNo = (t) => /\d/.test(t) && !/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(t) && t.replace(/\D/g, '').length < 9
  for (let i = 0; i < lines.length && !billNo; i++) {
    const m = lines[i].match(/(?:invoice|inv\.?|bill)\s*(?:no\.?|number|#)\s*[:.\-]?\s*(.*)$/i)
    if (!m) continue
    if (/(e-?\s*way|order|challan|delivery|supply|irn|ack)\W*$/i.test(lines[i].slice(0, m.index))) continue
    let t = tok(m[1].trim())
    if (!t && !m[1].trim()) t = tok((lines[i + 1] || '').trim())
    if (okNo(t)) billNo = t.replace(/[.\-/]+$/, '')
  }

  // party
  const label = mode === 'sale' ? SALE_LABEL : PUR_LABEL
  let party = null
  // A sale invoice can name a consignee (ship to) as well as the buyer (bill to): the buyer is the customer.
  const labelAt = []
  for (let i = 0; i < lines.length; i++) if (!isDeliv(lines[i]) && label.test(lines[i]) && !/^buyer['\u2019]?s?\s*(order|ref)/i.test(lines[i])) labelAt.push(i) // not "Buyer's Order No."
  // An e-way bill page prints a bare "From   To" header: that is a column heading, not the supplier.
  const bareHeading = (i) => /^(?:from|to)(?:\s+(?:from|to))*\s*[:-]?$/i.test(lines[i].match(label)?.[0].trim() ?? '') || /^from\s+to\b/i.test(lines[i])
  const li = mode === 'sale' ? labelAt.find((i) => !/^(consignee|ship)/i.test(lines[i])) ?? labelAt[0] : labelAt.find((i) => !bareHeading(i))
  if (li !== undefined) {
    const m = lines[li].match(label)
    const rest = m[1] && /[A-Za-z]/.test(m[1]) && !/^\(?\s*(buyer|billed|address)/i.test(m[1]) ? m[1] : ''
    party = partyFromBlock(readBlock(lines, li, rest))
  }
  if (!party && mode === 'purchase') {
    const k = sellerLine(lines)
    const i = k >= 0 ? k : lines.findIndex((l) => !TITLE_RE.test(l) && /[A-Za-z]{3}/.test(l) && !/^(page|invoice\s*(no|date)|date)\b/i.test(l))
    if (i >= 0) {
      party = partyFromBlock(readBlock(lines, i, lines[i], 12)) // a seller block runs on to CIN / contact lines
      if (party && !party.gstin) {
        const g = findGstin(lines.slice(Math.max(0, i - 4), i + 1).join('\n')) // "GST No: ..." printed just above the name
        if (g) Object.assign(party, { gstin: g, company: true })
      }
    }
  }

  // transport
  let lr = ''
  let lrDate = ''
  let transporter = ''
  for (const l of lines) {
    if (!lr) {
      const m = l.match(/\b(?:L\.?\s?R\.?\s*(?:No\.?|Number|#)|lorry\s*receipt(?:\s*no\.?)?|L\.R\.)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-/]*)/i)
      if (m) {
        lr = m[1]
        lrDate = findDate(l.slice(l.indexOf(m[0]) + m[0].length))
      }
    }
    if (!transporter && /^transporter\s+(?![:-])([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3})\s*$/i.test(l)) transporter = l.replace(/^transporter\s+/i, '').trim() // "Transporter LOCAL"
    if (!transporter && !/mode\s*of\s*transport/i.test(l)) {
      const m = l.match(/(?:name\s*of\s*(?:the\s*)?transport(?:er)?|transporter|transport\s*name)\s*[:-]\s*(.+)$/i)
      if (m) transporter = m[1].replace(/\s*(l\.?r\.?\s*no|vehicle|veh).*$/i, '').trim()
    }
  }

  // Tally style: the label sits on one line and the value on the next
  const after = (i, re) => {
    const same = lines[i].replace(re, '').replace(/^[\s:-]+/, '').trim()
    return same || lines[i + 1] || ''
  }
  if (!transporter) {
    const i = lines.findIndex((l) => /dispatched\s*through/i.test(l))
    if (i >= 0) {
      const v = after(i, /.*dispatched\s*through\s*(?:destination)?/i)
      const t = v.match(/^(.*?\b(?:express|logistics|transports?|carriers?|courier|cargo|roadways|travels)\b(?:\s+(?:ltd|limited|pvt|private)\b\.?)*)/i)
      transporter = (t ? t[1] : v.replace(RIGHT_COL, '').replace(/\s*(destination|motor|vehicle).*$/i, '')).trim()
    }
  }
  if (!lr) {
    const i = lines.findIndex((l) => /(bill\s*of\s*lading|\bL\.?R\.?\s*[-/]\s*R\.?R\.?)\s*(?:\/\s*L\.?R\.?\s*[-/]\s*R\.?R\.?)?\s*(?:no\.?)?(?:\s+motor\s+vehicle\s+no\.?)?\s*$/i.test(l))
    const m = i >= 0 && (lines[i + 1] || '').match(/^([A-Z0-9][A-Z0-9\-/]{3,})/i)
    if (m && /\d/.test(m[1])) {
      lr = m[1]
      lrDate = findDate(lines[i + 1])
    }
  }

  // item rows
  // The table header: its words in any order, and with a word or two lost to text recognition ("Description of goods" was
  // missing from one photo, "Qty" came out as "aty").
  const HEAD = [/descr|particulars|\bitems?\b|product|goods/i, /\bhsn\b|\bsac\b/i, /\b(?:qty|aty|ary|quantity)\b/i, /\bunit\b/i, /\brate\b/i, /taxable|\bamount\b/i, /\b[ci]?gst\b|\b1gst\b/i]
  const h = lines.findIndex((l) => (/(description|particulars|item|product|goods)/i.test(l) && /(qty|quantity)/i.test(l)) || HEAD.filter((re) => re.test(l)).length >= 3)
  const rows = []
  if (h >= 0) {
    let pending = ''
    for (let i = h + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^(total|sub\s*total|grand|amount\s*(chargeable|in\s*words)|taxable|cgst|sgst|igst|bank|terms|rupees|declaration)/i.test(l)) break
      // "HSN/SAC - 39094020" printed under the item row
      const hs = l.match(/^\s*HSN\s*\/?\s*(?:SAC)?\s*(?:code)?\s*[-:]?\s*(\d{4,8})\b/i)
      if (hs && rows.length && !rows[rows.length - 1].hsn) {
        rows[rows.length - 1].hsn = hs[1]
        continue
      }
      const nums = (l.replace(UNITS, ' ').match(NUM_RE) || []).length
      // second line of the table header ("No. of Pkgs. Rate") before the first item
      if (!rows.length && !/\d/.test(l) && (l.match(/\b(pkgs?|packs?|kind|rate|per|amount|hsn|sac|gst|cgst|sgst|igst|unit|uom|qty|quantity|less|add|value|taxable|total|disc)\b/gi) || []).length >= (pending ? 2 : 1)) {
        pending = ''
        continue
      }
      if (nums >= 3 || (nums >= 2 && /[A-Za-z]/.test(l) && /\d\s*(nos|pcs|kg)/i.test(l))) {
        const r = parseRow(pending ? `${pending} ${l}` : l)
        // a note with numbers but no quantity ("Size : 1000 X 600 X 0.55 MM") is not an item
        if (r.qty == null && !r.taxable && !/\b(?:nos?|pcs?|kgs?|units?|sets?)\b/i.test(l)) {
          pending = ''
          continue
        }
        if (r.desc || r.qty) rows.push(r)
        pending = ''
      } else if (rows.length && /[/-]$/.test(rows[rows.length - 1].desc || '') && nums <= 1 && l.length <= 30 && !rows[rows.length - 1].cont) {
        rows[rows.length - 1].desc += ' ' + l.replace(/^[^\w(]+/, '').trim() // "COPPER WIRE/" then "4MM"
        rows[rows.length - 1].cont = true
      } else if (/[A-Za-z]{3}/.test(l)) {
        const last = rows[rows.length - 1]
        // The description can sit on the line after its numbers ("slot type commutators" / "(Ring Type)"), or run on
        // to a second line that ends in a bracket.
        if (last && !nums && !last.cont && !isDeliv(l) && !/^(?:billed\s*address|same\s*as|state\b|e-?mail|invoice\s*total|terms)/i.test(l) && (!last.desc || /^\(|\)\s*$/.test(l))) {
          last.desc = (last.desc ? last.desc + ' ' : '') + l.replace(/^[^\w(]+/, '').trim()
          if (last.desc && /\)\s*$/.test(l)) last.cont = true
        } else pending = (pending ? pending + ' ' : '') + l
      }
    }
  }

  // Tax columns with only a header ("CGST SGST IGST") and the amounts in the item row: the amounts say which tax was charged.
  if (weakSupply && rows.length && rows[0].taxable) supply = taxFromRow(lines, rows[0].taxable) || supply
  rows.forEach((r) => delete r.cont)
  // The invoice total printed on the bill (last "Grand/Invoice total" style line with an amount), used to cross-check the rows.
  let total = null
  for (const l of rawLines) {
    const m = /(?:grand\s*total|invoice\s*total|total\s*invoice\s*value|net\s*(?:amount|payable)|amount\s*payable|total\s*amount)\D{0,25}?(\d[\d,]*(?:\.\d+)?)\s*$/i.exec(l)
    if (m && !isNaN(toNum(m[1]))) total = toNum(m[1])
  }
  return { party, date, billNo, supply, lr, lrDate, transporter, rows, total }
}
