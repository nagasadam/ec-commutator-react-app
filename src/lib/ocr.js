// Text recognition (OCR) for scanned PDFs. Used only when a PDF has no text layer.
// Everything runs in the browser: PDF.js draws each page to a canvas and Tesseract (tesseract.js,
// loaded lazily from jsDelivr, like PDF.js from cdnjs) reads the picture. Nothing is uploaded and
// nothing is stored; the page images are dropped as soon as they are read.
//
//   ocrText(page, opts)   one PDF.js page -> raw recognised text   (the default `ocrPage`)
//   ocrToLines(text)      raw text -> clean lines for parseDocument
//   loadTesseract()       lazy import, cached; throws { code: 'ocr-offline' }

export const OCR_MAX_PAGES = 3 // OCR is slow (several seconds a page); an invoice is normally page 1
export const OCR_WIDTH = 2400 // pixels across the page, about 290 dpi on A4: small print stays readable
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js'

const err = (code, message) => Object.assign(new Error(message), { code })

let tessP
export function loadTesseract() {
  tessP ||= import(/* @vite-ignore */ TESS_URL).catch(() => {
    tessP = null
    throw err('ocr-offline', 'This PDF is a scan and the text recognition (OCR) could not be loaded from the internet. Check your connection and try again.')
  })
  return tessP
}

// One worker is reused for all pages of a file and for the next file too (loading the English
// language data is the slow part). `progress` is swapped per call.
let workerP
let onProg = () => {}
async function getWorker() {
  workerP ||= (async () => {
    const mod = await loadTesseract()
    const createWorker = mod.createWorker || mod.default?.createWorker
    return createWorker('eng', 1, { logger: (m) => m?.status === 'recognizing text' && onProg(m.progress || 0) })
  })().catch((e) => {
    workerP = null
    throw e.code ? e : err('ocr-offline', 'This PDF is a scan and the text recognition (OCR) could not be started. Check your connection and try again.')
  })
  return workerP
}

export async function ocrText(page, { onProgress } = {}) {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: OCR_WIDTH / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  const worker = await getWorker()
  onProg = onProgress || (() => {})
  try {
    const { data } = await worker.recognize(canvas)
    return data.text || ''
  } finally {
    onProg = () => {}
    canvas.width = canvas.height = 0 // release the page image
  }
}

// Raw OCR text -> lines. Table borders come out as | { } [ ] _ ; they are noise, not text.
export function ocrToLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/[|{}[\]_]/g, ' ').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim())
    .filter((l) => (l.match(/[A-Za-z0-9]/g) || []).length >= 2)
}
