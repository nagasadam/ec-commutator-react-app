// Minimal hand-written PDF writer (no dependency). Helvetica, A4, text and table rows only.
// Helvetica's built-in encoding has no rupee sign, so amounts are written as "Rs.".

const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
const num = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const rs = (n) => 'Rs. ' + num(n)

// doc = { title, subtitle?, blocks: [ {h:'Heading'} | {p:'text'} | {table:{cols:[{t,w,r?}], rows:[[..]]}} ] }
export function buildPdf(doc) {
  const W = 595
  const H = 842
  const M = 40
  const pages = []
  let ops = []
  let y = H - M
  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'))
    ops = []
    y = H - M
  }
  const text = (x, yy, s, size = 10, bold = false, right = false) => {
    const w = String(s).length * size * 0.5
    ops.push(`BT /F${bold ? 2 : 1} ${size} Tf ${(right ? x - w : x).toFixed(1)} ${yy.toFixed(1)} Td (${esc(s)}) Tj ET`)
  }
  const line = (yy) => ops.push(`0.6 w ${M} ${yy.toFixed(1)} m ${W - M} ${yy.toFixed(1)} l S`)
  const need = (h) => {
    if (y - h < M) newPage()
  }

  text(M, y, doc.title, 16, true)
  y -= 18
  if (doc.subtitle) {
    text(M, y, doc.subtitle, 10)
    y -= 14
  }
  line(y)
  y -= 16
  for (const bl of doc.blocks) {
    if (bl.h) {
      need(28)
      text(M, y, bl.h, 12, true)
      y -= 16
    } else if (bl.p) {
      need(16)
      text(M, y, bl.p, 10)
      y -= 14
    } else if (bl.table) {
      const { cols, rows } = bl.table
      const total = cols.reduce((s, c) => s + c.w, 0)
      const k = (W - 2 * M) / total
      const draw = (cells, bold) => {
        let x = M
        cols.forEach((c, i) => {
          const w = c.w * k
          const s = String(cells[i] ?? '')
          const maxCh = Math.max(3, Math.floor(w / 5))
          const t = s.length > maxCh ? s.slice(0, maxCh - 1) + '.' : s
          text(c.r ? x + w - 4 : x + 2, y, t, 9, bold, !!c.r)
          x += w
        })
        y -= 13
      }
      need(30)
      draw(cols.map((c) => c.t), true)
      line(y + 9)
      for (const r of rows) {
        if (y - 13 < M) {
          newPage()
          draw(cols.map((c) => c.t), true)
          line(y + 9)
        }
        draw(r, false)
      }
      y -= 6
    }
  }
  newPage()

  // Object layout: 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs.
  const objs = []
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  pages.forEach((p, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${p.length} >>\nstream\n${p}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => {
    offs.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offs.forEach((o) => (out += String(o).padStart(10, '0') + ' 00000 n \n'))
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // All characters are ASCII (esc() strips the rest), so string length equals byte length.
  return new TextEncoder().encode(out)
}

export function statementPdf(b, party, kind, led) {
  const cust = kind === 'cust'
  return buildPdf({
    title: `${b.name} - ${cust ? 'Customer' : 'Supplier'} statement`,
    subtitle: `${party.name}${party.gstin ? '  GSTIN ' + party.gstin : ''}   Opening ${rs(led.opening)}`,
    blocks: [
      {
        table: {
          cols: [
            { t: 'Date', w: 12 },
            { t: 'Ref', w: 12 },
            { t: 'Details', w: 26 },
            { t: 'Debit', w: 14, r: true },
            { t: 'Credit', w: 14, r: true },
            { t: 'Balance', w: 16, r: true },
          ],
          rows: led.rows.map((r) => [r.date, r.ref, r.text, r.debit ? num(r.debit) : '', r.credit ? num(r.credit) : '', num(r.balance)]),
        },
      },
      { p: `Closing balance: ${rs(led.closing)} ${led.closing >= 0 ? (cust ? '(they owe you)' : '(you owe them)') : '(advance)'}` },
    ],
  })
}

export function downloadBytes(bytes, filename, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
