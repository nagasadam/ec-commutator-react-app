// PDF import, step 1: a PDF or a photo -> text lines (PDF.js from cdnjs, loaded lazily; OCR for scans, see ../ocr.js).
import { OCR_MAX_PAGES, PHOTO_MAX_BYTES, ocrImage, ocrText, ocrToLines } from '../ocr.js'

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
// A photo (JPEG, PNG, WebP) is recognised by its first bytes, whatever its file name or type says.
const isPhoto = (data) =>
  (data[0] === 0xff && data[1] === 0xd8) || (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e) || (String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...data.subarray(8, 12)) === 'WEBP')

export async function extractLines(file, pdfjs, opts = {}) {
  if (file.size > PHOTO_MAX_BYTES) throw err('too-big', 'This file is larger than 25 MB.')
  if (file.size > MAX_BYTES) {
    // Over the PDF limit: only a photo may be this big, and the first bytes tell which it is (nothing else is read).
    const head = file.slice ? new Uint8Array(await file.slice(0, 12).arrayBuffer()) : null
    if (!head || !isPhoto(head)) throw err('too-big', 'This PDF is larger than 10 MB.')
  }
  const data = new Uint8Array(await file.arrayBuffer())
  if (isPhoto(data)) {
    // A photo of a printed bill: read it with text recognition (opts.ocrImage replaces the browser one in tests).
    opts.onProgress?.({ stage: 'ocr', page: 1, pages: 1, pct: 0 })
    const read = opts.ocrImage || ocrImage
    const lines = ocrToLines(await read(file, { onProgress: (pct) => opts.onProgress?.({ stage: 'ocr', page: 1, pages: 1, pct }) }))
    if (lines.join('').replace(/\s/g, '').length < 20) throw err('no-text', 'No text could be read from this photo. Take it again in good light with the whole bill in view, or enter the invoice by hand.')
    lines.ocr = true
    lines.photo = true
    return lines
  }
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
