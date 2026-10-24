// PDF import for invoices and purchases (spec: pdf-import.md).
// Layers, each testable on its own:
//   loadPdfjs / extractLines  browser side: PDF -> text lines (PDF.js from cdnjs, lazy).
//                             A scanned PDF (no text layer) is read by OCR instead, see ocr.js
//   parseDocument             lines -> { party, date, supply, lr, transporter, rows }
//   buildDraft                match the party and items against the business
//   autoSaveIssues            why a draft may NOT be saved automatically
//   addInvoice / addPurchases the one place that writes the records
import { find, valuation } from './calc.js'
import { nextNo } from './model.js'
import { partyError } from './rules.js'
import { uid } from './format.js'
import { OCR_MAX_PAGES, ocrText, ocrToLines } from './ocr.js'

export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_PAGES = 5
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'

const err = (code, message) => Object.assign(new Error(message), { code })

// ---------------------------------------------------------------- extraction
let pdfjsP
export function loadPdfjs() {
  pdfjsP ||= (async () => {
    let lib
    try {
      lib = await import(/* @vite-ignore */ PDFJS_URL)
    } catch {
      pdfjsP = null
      throw err('offline', 'Could not load the PDF reader from the internet. Check your connection and try again.')
    }
    try {
      // a cross-origin worker is refused by browsers, so run it from a same-origin blob
      const src = await (await fetch(WORKER_URL)).text()
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    } catch {
      lib.GlobalWorkerOptions.workerSrc = WORKER_URL // PDF.js falls back to running without a worker
    }
    return lib
  })()
  return pdfjsP
}

// Group PDF.js text items into visual lines (same baseline), left to right.
export function itemsToLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    const x = it.transform[4]
    let row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, w: it.width || 0, s: it.str })
  }
  rows.sort((a, c) => c.y - a.y)
  return rows.map((r) => {
    r.parts.sort((a, c) => a.x - c.x)
    let out = ''
    let end = null
    for (const p of r.parts) {
      if (end !== null && p.x - end > 1.5 && !out.endsWith(' ') && !p.s.startsWith(' ')) out += ' '
      out += p.s
      end = p.x + p.w
    }
    return out.replace(/\s+/g, ' ').trim()
  })
}

// opts.ocr === false turns OCR off (a scan then fails with 'no-text').
// opts.ocrPage(page, { onProgress }) -> raw text of one page; defaults to the browser OCR in ocr.js.
// opts.onProgress({ stage: 'ocr', page, pages, pct }) is called while a scan is being read.
// The returned array has `.ocr = true` when the lines came from OCR rather than a text layer.
export async function extractLines(file, pdfjs, opts = {}) {
  if (file.size > MAX_BYTES) throw err('too-big', 'This PDF is larger than 10 MB.')
  const data = new Uint8Array(await file.arrayBuffer())
  if (String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') throw err('not-pdf', 'This file is not a PDF.')
  const lib = pdfjs || (await loadPdfjs())
  let doc
  try {
    doc = await lib.getDocument({ data }).promise
  } catch (e) {
    throw err('unreadable', e?.name === 'PasswordException' ? 'This PDF is password protected.' : 'This PDF could not be read.')
  }
  const lines = []
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    lines.push(...itemsToLines(tc.items))
  }
  if (lines.join('').replace(/\s/g, '').length >= 20) return lines
  if (opts.ocr === false) throw err('no-text', 'This PDF has no readable text (it looks like a scan). Scanned PDFs cannot be read.')

  // A scan: no text layer, so read the page pictures.
  const read = opts.ocrPage || ocrText
  const pages = Math.min(doc.numPages, OCR_MAX_PAGES)
  const out = []
  for (let i = 1; i <= pages; i++) {
    opts.onProgress?.({ stage: 'ocr', page: i, pages, pct: 0 })
    const page = await doc.getPage(i)
    out.push(...ocrToLines(await read(page, { onProgress: (pct) => opts.onProgress?.({ stage: 'ocr', page: i, pages, pct }) })))
  }
  if (out.join('').replace(/\s/g, '').length < 20) throw err('no-text', 'This PDF is a scan and no text could be recognised in it. Enter the invoice by hand.')
  out.ocr = true
  return out
}

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
const SALE_LABEL = /^(?:to\b|bill(?:ed)?\s*to\b|buyer\b|customer\b|sold\s*to\b|consignee\b|m\/s\b)\s*[,:\-.]?\s*(?:\([^)]*\))?\s*[:\-]?\s*(.*)$/i
const PUR_LABEL = /^(?:from\b|supplier\b|seller\b|vendor\b|sold\s*by\b|billed\s*from\b)\s*[,:\-.]?\s*(?:\([^)]*\))?\s*[:\-]?\s*(.*)$/i
const STOP_RE = /^(sl\.?\s*no|s\.?\s*no|sr\.?\s*no|description|particulars|ship(?:ped)?\s*to|invoice\s*(no|date)|place\s*of\s*supply|name\s*of\s*(the\s*)?transport|transporter|l\.?r\.?\s*no|bank\b|delivery)/i
const PHONE_RE = /(?:ph(?:one)?(?:\s*no)?|mob(?:ile)?(?:\s*no)?|tel|contact|cell)\.?\s*[:\-]?\s*(\+?[\dO][\dO\s-]{8,14}\d)/i
const FIRM_WORDS = /\b(pvt|private|ltd|limited|llp|industries|industry|enterprises?|engineering|engg|works|traders?|motors?|company|co|corporation|corp|associates|& sons|brothers|bros|agencies|electricals?|electric)\b/i

// "BUYER DELIVERED ADDRESS: Same as in the customer name" is a delivery note, not part of the customer.
const DELIV_RE = /\(?\s*(?:buyer\s*)?(?:deliver(?:ed|y)|ship(?:ped|ping)?)\s*(?:to\s*)?(?:address)?\s*\)?\s*[:\-]?.*$/i
const isDeliv = (l) => /^\(?\s*(?:buyer\s*)?(?:deliver(?:ed|y)|ship(?:ped|ping)?)\s*(?:to|address)/i.test(l)
const noDeliv = (l) => l.replace(DELIV_RE, '').trim()

// Text from the next column of a two-column header ("ACME LTD. Invoice No. e-Way Bill No.") that
// the reader put on the same line. It is never part of the party.
const RIGHT_COL = /\s+(?:invoice\s*no|e-?way|delivery\s*note|mode\/?\s*terms|reference\s*no|buyer'?s?\s*order|dispatch|other\s*ref|dated)\b.*$/i
const cleanName = (s) =>
  noDeliv(s)
    .replace(RIGHT_COL, '')
    .replace(/^m\/s\.?\s*/i, '')
    .replace(/\s*(gstin|gst\s*no|gst|ph|phone|mob|mobile|tel)\b.*$/i, '')
    .replace(/[,;:\s]+$/, '')
    .trim()

function readBlock(lines, i, first, max = 8) {
  const out = first ? [first] : []
  for (let k = i + 1; k < lines.length && out.length < max; k++) {
    const l = lines[k]
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
    for (let k = i; k >= Math.max(0, i - 10); k--) {
      const n = cleanName(lines[k])
      if (n && FIRM_WORDS.test(n) && !TITLE_RE.test(n) && !/^(irn|ack|invoice|e-?way)\b/i.test(n)) return k
    }
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

function parseRow(text) {
  const s = text
    .replace(/^\s*\d{1,3}[.)]?\s+(?=[A-Za-z])/, '')
    // "1 05 CTNS Mica ..." : serial number and package count come before the description
    .replace(/^\s*(?:\d{1,3}[.)]?\s+)?\d+\s*(?:ctns?|cartons?|bags?|boxes|box|pkgs?|bundles?|rolls?|drums?|cases?)\.?\s+(?=[A-Za-z])/i, '')
  const firstNum = s.search(/\d/)
  const desc = (firstNum > 0 ? s.slice(0, firstNum) : '').replace(UNITS, '').replace(/[\s,;:|(-]+$/, '').trim()
  const rest = firstNum >= 0 ? s.slice(firstNum) : ''
  const hsnM = rest.match(/^\d{4,8}\b(?!\.)/)
  const hsn = hsnM ? hsnM[0] : ''
  const nums = (rest.replace(UNITS, ' ').match(NUM_RE) || []).map(toNum).filter((n) => !isNaN(n))
  const body = hsn ? nums.slice(1) : nums
  const t = triple(body) || triple(nums)
  if (t) return { desc, hsn, ...t }
  // fallback: a quantity followed by a unit word, then a rate
  const qm = rest.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:nos?|pcs?|kgs?|units?|sets?)\b\.?\s*(\d[\d,]*(?:\.\d+)?)?/i)
  return { desc, hsn, qty: qm ? toNum(qm[1]) : null, rate: qm && qm[2] ? toNum(qm[2]) : null, taxable: null }
}

export function parseDocument(rawLines, mode = 'sale') {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const joined = lines.join('\n')

  // supply type from the tax columns
  const supply = /\bIGST\b/i.test(joined) ? 'inter' : /\bCGST\b/i.test(joined) && /\bSGST\b/i.test(joined) ? 'intra' : null

  // date: the invoice date, never a date of supply / due date / order date
  let date = ''
  for (let i = 0; i < lines.length && !date; i++) {
    const l = lines[i]
    if (/(supply|due|order|p\.?o\.?\b|lr\b|l\.r|lorry|dispatch|ack)/i.test(l) && !/invoice\s*date/i.test(l)) continue
    if (/(invoice|inv\.?|bill)\s*date|^date\b|\bdate\b|\bdated\b/i.test(l)) date = findDate(l) || (/dated?\s*[:\-]?\s*$/i.test(l) ? findDate(lines[i + 1] || '') : '')
  }

  // party
  const label = mode === 'sale' ? SALE_LABEL : PUR_LABEL
  let party = null
  // A sale invoice can name a consignee (ship to) as well as the buyer (bill to): the buyer is the customer.
  const labelAt = []
  for (let i = 0; i < lines.length; i++) if (!isDeliv(lines[i]) && label.test(lines[i]) && !/^buyer['\u2019]?s?\s*(order|ref)/i.test(lines[i])) labelAt.push(i) // not "Buyer's Order No."
  const li = mode === 'sale' ? labelAt.find((i) => !/^(consignee|ship)/i.test(lines[i])) ?? labelAt[0] : labelAt[0]
  if (li !== undefined) {
    const m = lines[li].match(label)
    const rest = m[1] && /[A-Za-z]/.test(m[1]) && !/^\(?\s*(buyer|billed|address)/i.test(m[1]) ? m[1] : ''
    party = partyFromBlock(readBlock(lines, li, rest))
  }
  if (!party && mode === 'purchase') {
    const k = sellerLine(lines)
    const i = k >= 0 ? k : lines.findIndex((l) => !TITLE_RE.test(l) && /[A-Za-z]{3}/.test(l) && !/^(page|invoice\s*(no|date)|date)\b/i.test(l))
    if (i >= 0) party = partyFromBlock(readBlock(lines, i, lines[i], 12)) // a seller block runs on to CIN / contact lines
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
    if (!transporter && !/mode\s*of\s*transport/i.test(l)) {
      const m = l.match(/(?:name\s*of\s*(?:the\s*)?transport(?:er)?|transporter|transport\s*name)\s*[:\-]\s*(.+)$/i)
      if (m) transporter = m[1].replace(/\s*(l\.?r\.?\s*no|vehicle|veh).*$/i, '').trim()
    }
  }

  // Tally style: the label sits on one line and the value on the next
  const after = (i, re) => {
    const same = lines[i].replace(re, '').replace(/^[\s:\-]+/, '').trim()
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
    const i = lines.findIndex((l) => /(bill\s*of\s*lading|\bL\.?R\.?\s*[-/]\s*R\.?R\.?)\s*(?:\/\s*L\.?R\.?\s*[-/]\s*R\.?R\.?)?\s*(?:no\.?)?\s*$/i.test(l))
    const m = i >= 0 && (lines[i + 1] || '').match(/^([A-Z0-9][A-Z0-9\-/]{3,})/i)
    if (m && /\d/.test(m[1])) {
      lr = m[1]
      lrDate = findDate(lines[i + 1])
    }
  }

  // item rows
  const h = lines.findIndex((l) => /(description|particulars|item|product|goods)/i.test(l) && /(qty|quantity)/i.test(l))
  const rows = []
  if (h >= 0) {
    let pending = ''
    for (let i = h + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^(total|sub\s*total|grand|amount\s*(chargeable|in\s*words)|taxable|cgst|sgst|igst|bank|terms|rupees|declaration)/i.test(l)) break
      const nums = (l.replace(UNITS, ' ').match(NUM_RE) || []).length
      // second line of the table header ("No. of Pkgs. Rate") before the first item
      if (!rows.length && !pending && !/\d/.test(l) && /\b(pkgs?|kind|rate|per|amount|hsn|gst|unit|qty|quantity)\b/i.test(l)) continue
      if (nums >= 3 || (nums >= 2 && /[A-Za-z]/.test(l) && /\d\s*(nos|pcs|kg)/i.test(l))) {
        const r = parseRow(pending ? `${pending} ${l}` : l)
        // a note with numbers but no quantity ("Size : 1000 X 600 X 0.55 MM") is not an item
        if (r.qty == null && !r.taxable && !/\b(?:nos?|pcs?|kgs?|units?|sets?)\b/i.test(l)) {
          pending = ''
          continue
        }
        if (r.desc || r.qty) rows.push(r)
        pending = ''
      } else if (/[A-Za-z]{3}/.test(l)) pending = (pending ? pending + ' ' : '') + l
    }
  }

  return { party, date, supply, lr, lrDate, transporter, rows }
}

// -------------------------------------------------------------------- matching
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\b(m\/s|pvt|private|ltd|limited|llp|the)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const words = (s) => norm(s).split(' ').filter((w) => w.length > 1).map((w) => w.replace(/s$/, ''))

export function matchParty(list, p) {
  if (!p) return null
  if (p.gstin) {
    const g = list.find((x) => (x.gstin || '').toUpperCase() === p.gstin.toUpperCase())
    if (g) return g
  }
  const n = norm(p.name)
  if (!n) return null
  return list.find((x) => norm(x.name) === n) || null
}

export function matchItem(items, desc, hsn = '') {
  const d = norm(desc)
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
  const found = matchParty(list, parsed.party)
  const p = parsed.party
  const firmBiz = b.kind === 'firm'
  return {
    mode,
    party: found ? found.id : p ? '__new__' : '',
    newParty: !found && p ? { name: p.name, gstin: p.gstin, phone: p.phone, address: p.address, company: firmBiz ? true : p.company } : null,
    date: parsed.date || '',
    dateFound: !!parsed.date,
    lr: parsed.lr || '',
    lrDate: parsed.lrDate || '',
    transporter: parsed.transporter || '',
    supply: parsed.supply,
    rows: parsed.rows.map((r) => ({ desc: r.desc, qty: r.qty, rate: r.rate, item: (matchItem(pool, r.desc, r.hsn) || {}).id || '' })),
  }
}

const sig = (lines) => lines.map((l) => `${l.item}|${+l.qty}|${+l.rate}`).sort().join(';')

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
export async function importFile(file, { mode, getB, updB, auto, mark, pdfjs, onProgress, ocrPage }) {
  const lines = await extractLines(file, pdfjs, { onProgress, ocrPage })
  const d = buildDraft(getB(), parseDocument(lines, mode), mode)
  const issues = autoSaveIssues(getB(), d)
  // Text recognition can misread a digit, so a scan is never saved without a human check.
  if (lines.ocr) issues.unshift('This PDF is a scanned image. Its text was read by text recognition and can contain mistakes, so check every field before saving.')
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
