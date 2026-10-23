import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { find, prrTot, srTot } from '../lib/calc.js'
import { nextNo } from '../lib/model.js'
import { inr, qtyFmt, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field } from '../ui.jsx'

function SalesReturn() {
  const { b, updB } = useStore()
  const [f, setF] = useState({ inv: '', item: '', qty: '', date: today() })
  const [err, setErr] = useState('')
  const inv = find(b.inv, f.inv)
  const sold = inv?.lines.find((l) => l.item === f.item)?.qty || 0
  const back = b.sr.filter((s) => s.inv === f.inv && s.item === f.item).reduce((s, r) => s + r.qty, 0)

  const submit = (e) => {
    e.preventDefault()
    if (!inv || !f.item || !(+f.qty > 0)) return setErr('Choose an invoice, an item and a quantity.')
    if (+f.qty > sold - back) return setErr(`Only ${qtyFmt(sold - back)} can still be returned on this invoice.`)
    setErr('')
    updB((x) => x.sr.push({ id: uid(), no: nextNo(x.sr, 'CN-'), date: f.date, inv: f.inv, item: f.item, qty: +f.qty }))
    setF({ inv: '', item: '', qty: '', date: today() })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Sales return (credit note)</h3>
      <div className="grid">
        <Field label="Invoice">
          <select value={f.inv} onChange={(e) => setF({ ...f, inv: e.target.value, item: '' })}>
            <option value="">Select…</option>
            {b.inv.map((i) => (
              <option key={i.id} value={i.id}>
                {i.no} · {find(b.cust, i.cust)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Item">
          <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
            <option value="">Select…</option>
            {inv?.lines.map((l) => (
              <option key={l.item} value={l.item}>
                {find(b.items, l.item)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qty returned">
          <input type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
      </div>
      <ErrBar msg={err} />
      <button className="btn">Issue credit note</button>
      {b.sr.length === 0 ? (
        <Empty>No credit notes.</Empty>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Date</th>
                <th>Invoice</th>
                <th>Item</th>
                <th className="r">Qty</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {b.sr.map((s) => (
                <tr key={s.id}>
                  <td>{s.no}</td>
                  <td>{dmy(s.date)}</td>
                  <td>{find(b.inv, s.inv)?.no}</td>
                  <td>{find(b.items, s.item)?.name}</td>
                  <td className="r">{qtyFmt(s.qty)}</td>
                  <td className="r">{inr(srTot(b, s).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  )
}

function PurchaseReturn() {
  const { b, updB } = useStore()
  const [f, setF] = useState({ pur: '', item: '', qty: '', date: today() })
  const [err, setErr] = useState('')
  const p = find(b.pur, f.pur)
  const bought = p?.lines.find((l) => l.item === f.item)?.qty || 0
  const back = b.prr.filter((s) => s.pur === f.pur && s.item === f.item).reduce((s, r) => s + r.qty, 0)

  const submit = (e) => {
    e.preventDefault()
    if (!p || !f.item || !(+f.qty > 0)) return setErr('Choose a purchase, an item and a quantity.')
    if (+f.qty > bought - back) return setErr(`Only ${qtyFmt(bought - back)} can still be returned on this purchase.`)
    setErr('')
    updB((x) => x.prr.push({ id: uid(), no: nextNo(x.prr, 'DN-'), date: f.date, pur: f.pur, item: f.item, qty: +f.qty }))
    setF({ pur: '', item: '', qty: '', date: today() })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Purchase return (debit note)</h3>
      <div className="grid">
        <Field label="Purchase">
          <select value={f.pur} onChange={(e) => setF({ ...f, pur: e.target.value, item: '' })}>
            <option value="">Select…</option>
            {b.pur.map((x) => (
              <option key={x.id} value={x.id}>
                {x.no} · {find(b.sup, x.sup)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Item">
          <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
            <option value="">Select…</option>
            {p?.lines.map((l) => (
              <option key={l.item} value={l.item}>
                {find(b.items, l.item)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qty returned">
          <input type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
      </div>
      <ErrBar msg={err} />
      <button className="btn">Issue debit note</button>
      {b.prr.length === 0 ? (
        <Empty>No debit notes.</Empty>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Date</th>
                <th>Purchase</th>
                <th>Item</th>
                <th className="r">Qty</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {b.prr.map((s) => (
                <tr key={s.id}>
                  <td>{s.no}</td>
                  <td>{dmy(s.date)}</td>
                  <td>{find(b.pur, s.pur)?.no}</td>
                  <td>{find(b.items, s.item)?.name}</td>
                  <td className="r">{qtyFmt(s.qty)}</td>
                  <td className="r">{inr(prrTot(b, s).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  )
}

function Rejects() {
  const { b, updB } = useStore()
  const [f, setF] = useState({ item: '', qty: '', date: today(), note: '' })
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!f.item || !(+f.qty > 0)) return setErr('Choose an item and a quantity.')
    setErr('')
    updB((x) => x.rej.push({ id: uid(), date: f.date, item: f.item, qty: +f.qty, note: f.note.trim() }))
    setF({ item: '', qty: '', date: today(), note: '' })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Rejects (written off stock)</h3>
      <div className="grid">
        <Field label="Item">
          <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
            <option value="">Select…</option>
            {b.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qty">
          <input type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Note">
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <ErrBar msg={err} />
      <button className="btn">Record reject</button>
      {b.rej.length === 0 ? (
        <Empty>No rejects.</Empty>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th className="r">Qty</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.rej.map((r) => (
                <tr key={r.id}>
                  <td>{dmy(r.date)}</td>
                  <td>{find(b.items, r.item)?.name}</td>
                  <td className="r">{qtyFmt(r.qty)}</td>
                  <td>{r.note}</td>
                  <td className="r">
                    <button type="button" className="btn ghost" onClick={() => updB((x) => (x.rej = x.rej.filter((y) => y.id !== r.id)))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  )
}

export default function Returns() {
  return (
    <>
      <SalesReturn />
      <PurchaseReturn />
      <Rejects />
    </>
  )
}
