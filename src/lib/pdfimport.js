// PDF import for invoices and purchases (spec: pdf-import.md).
// Layers, each testable on its own:
//   loadPdfjs / extractLines  browser side: PDF -> text lines (PDF.js from cdnjs, lazy).
//                             A scanned PDF (no text layer) is read by OCR instead, see ocr.js
//   parseDocument             lines -> { party, date, supply, lr, transporter, rows }
//   buildDraft                match the party and items against the business
//   autoSaveIssues            why a draft may NOT be saved automatically
//
// The code lives in src/lib/pdf/: extract.js (read), parse.js (parse), match.js (match and write).
// This file keeps the old import path working for the rest of the app.
export * from './pdf/extract.js'
export * from './pdf/parse.js'
export * from './pdf/match.js'
