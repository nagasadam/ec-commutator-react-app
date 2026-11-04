// Reads the QR code printed on a GST e-invoice. It holds the supplier's GSTIN, the buyer's GSTIN, the invoice
// number and date, signed by the government's invoice portal, so it is far more reliable than text recognition
// for exactly those fields. Only browsers that offer BarcodeDetector (Chrome on Android, Safari 17+) can read
// it; elsewhere this quietly returns nothing and the bill is read as text only.

const b64urlText = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
}
const isoDate = (s) => {
  const m = String(s || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

// QR text -> { sellerGstin, buyerGstin, docNo, date (YYYY-MM-DD), total, irn } or null when it is not an e-invoice QR.
export function parseEInvoiceQr(raw) {
  try {
    const s = String(raw || '').trim()
    let o
    if (s.startsWith('{')) o = JSON.parse(s)
    else {
      const parts = s.split('.')
      if (parts.length !== 3) return null
      o = JSON.parse(b64urlText(parts[1])) // the middle part of the signed token
    }
    const d = typeof o.data === 'string' ? JSON.parse(o.data) : o.data || o
    if (!d || typeof d !== 'object' || !d.SellerGstin || !d.DocNo) return null
    return {
      sellerGstin: String(d.SellerGstin).toUpperCase(),
      buyerGstin: d.BuyerGstin ? String(d.BuyerGstin).toUpperCase() : '',
      docNo: String(d.DocNo),
      date: isoDate(d.DocDt),
      total: d.TotInvVal != null ? +d.TotInvVal : null,
      irn: d.Irn ? String(d.Irn) : '',
    }
  } catch {
    return null
  }
}

export async function readInvoiceQr(file) {
  try {
    if (typeof BarcodeDetector === 'undefined' || typeof createImageBitmap === 'undefined') return null
    const bmp = await createImageBitmap(file)
    try {
      const codes = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp)
      for (const c of codes) {
        const q = parseEInvoiceQr(c.rawValue)
        if (q) return q
      }
    } finally {
      bmp.close?.()
    }
  } catch {
    /* a QR is a bonus: never fail the import because of it */
  }
  return null
}
