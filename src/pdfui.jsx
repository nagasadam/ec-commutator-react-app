import { useRef, useState } from 'react'
import { Icon } from './icons.jsx'

const KEY = 'ec_pdf_auto'
const readAuto = () => {
  try {
    return localStorage.getItem(KEY) !== '0' // on by default
  } catch {
    return true
  }
}

export function usePdfAuto() {
  const [auto, setAuto] = useState(readAuto)
  const set = (v) => {
    setAuto(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      /* the choice just is not remembered */
    }
  }
  return [auto, set]
}

// Upload button + "Save automatically" checkbox. `onFile(file)` does the work.
export function PdfUpload({ auto, setAuto, busy, status, onFile, label = 'Upload PDF invoice' }) {
  const ref = useRef(null)
  return (
    <div className="pdfbar">
      <button type="button" className="btn ghost" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon n="pdf" duo />
        {busy ? status || 'Reading PDF…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        data-testid="pdf-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      <label className="chk">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Save automatically
      </label>
    </div>
  )
}

// Result box above the form. kind: 'ok' | 'warn' | 'err'.
export function PdfNote({ note, onDismiss }) {
  if (!note) return null
  return (
    <div className={'pdfnote ' + note.kind} role={note.kind === 'err' ? 'alert' : 'status'}>
      <div>
        <b>{note.title}</b>
        {note.lines?.length > 0 && (
          <ul>
            {note.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}

export function NewParty({ title, p, setP, forceFirm }) {
  return (
    <div className="newparty">
      <h4>{title}</h4>
      <div className="grid">
        <label className="fld">
          <span>Name</span>
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </label>
        {!forceFirm && (
          <label className="fld">
            <span>Type</span>
            <select value={p.company ? 'firm' : 'person'} onChange={(e) => setP({ ...p, company: e.target.value === 'firm' })}>
              <option value="firm">Firm / company (GST 18%)</option>
              <option value="person">Person (no GST)</option>
            </select>
          </label>
        )}
        {p.company && (
          <label className="fld">
            <span>GSTIN</span>
            <input value={p.gstin} maxLength={15} onChange={(e) => setP({ ...p, gstin: e.target.value })} />
          </label>
        )}
        <label className="fld">
          <span>Phone</span>
          <input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />
        </label>
        <label className="fld wide">
          <span>Address</span>
          <input value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} />
        </label>
      </div>
    </div>
  )
}
