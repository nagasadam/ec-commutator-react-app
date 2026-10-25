import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { find, valuation } from '../lib/calc.js'
import { inr, qtyFmt, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field, useDialog } from '../ui.jsx'

export default function Production() {
  const { b, updB } = useStore()
  const { ask } = useDialog()
  const fgs = b.items.filter((i) => i.type === 'fg')
  const [f, setF] = useState({ item: '', qty: '', date: today() })
  const [err, setErr] = useState('')
  const v = useMemo(() => valuation(b), [b])

  const submit = (e) => {
    e.preventDefault()
    const fg = find(b.items, f.item)
    if (!fg || !(+f.qty > 0)) return setErr('Choose a finished item and a quantity.')
    if (!fg.bom?.length) return setErr('This item has no bill of materials. Set one in Inventory first.')
    const record = () => {
      setErr('')
      updB((x) => x.prod.push({ id: uid(), date: f.date, item: f.item, qty: +f.qty }))
      setF({ item: '', qty: '', date: today() })
    }
    const short = fg.bom.find((m) => m.qty * +f.qty > (v.qty[m.item] || 0))
    if (short) ask(`Not enough ${find(b.items, short.item)?.name} in stock for this run. Record it anyway?`, record, 'Record anyway')
    else record()
  }

  const del = (r) => ask('Delete this production run?', () => updB((x) => (x.prod = x.prod.filter((y) => y.id !== r.id))), 'Delete')

  return (
    <>
      <div className="work">
        <div className="main">
      <div className="card">
        <h3>Production runs</h3>
        {b.prod.length === 0 ? (
          <Empty>No production yet.</Empty>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th className="r">Qty</th>
                  <th>Raw material used</th>
                  <th className="r">Cost</th>
                  <th className="r">Cost / unit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...b.prod].reverse().map((r) => {
                  const p = v.prod[r.id]
                  return (
                    <tr key={r.id}>
                      <td>{dmy(r.date)}</td>
                      <td>{find(b.items, r.item)?.name}</td>
                      <td className="r">{qtyFmt(r.qty)}</td>
                      <td>
                        {p?.used.map((u) => `${find(b.items, u.item)?.name} ${qtyFmt(u.qty)}`).join(', ')}
                      </td>
                      <td className="r">{inr(p?.cost)}</td>
                      <td className="r">{inr((p?.cost || 0) / r.qty)}</td>
                      <td className="r">
                        <button className="btn ghost" onClick={() => del(r)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </div>
        <div className="side">
      <form className="card" onSubmit={submit}>
        <h3>Record production</h3>
        <div className="grid">
          <Field label="Finished item">
            <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
              <option value="">Select…</option>
              {fgs.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity produced">
            <input type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </Field>
          <Field label="Date">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <ErrBar msg={err} />
        <button className="btn">Record run</button>
      </form>
        </div>
      </div>
    </>
  )
}
