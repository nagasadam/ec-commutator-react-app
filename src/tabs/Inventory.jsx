import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { valuation } from '../lib/calc.js'
import { inr, qtyFmt, uid } from '../lib/format.js'
import { Empty, ErrBar, Field, Modal } from '../ui.jsx'

const blank = { name: '', type: 'raw', unit: 'kg', hsn: '', open: '', openCost: '', rate: '' }

function BomEditor({ item, onClose }) {
  const { b, updB } = useStore()
  const raws = b.items.filter((i) => i.type === 'raw')
  const cur = Object.fromEntries((item.bom || []).map((m) => [m.item, m.qty]))
  const [q, setQ] = useState(Object.fromEntries(raws.map((r) => [r.id, cur[r.id] ?? ''])))
  const save = () => {
    updB((x) => {
      const it = x.items.find((i) => i.id === item.id)
      it.bom = raws.filter((r) => +q[r.id] > 0).map((r) => ({ item: r.id, qty: +q[r.id] }))
    })
    onClose()
  }
  return (
    <Modal title={`Bill of materials — ${item.name}`} onClose={onClose}>
      <p className="muted">Raw material used per 1 {item.unit} of {item.name}. Production consumes stock using this list.</p>
      {raws.map((r) => (
        <Field key={r.id} label={`${r.name} (${r.unit})`}>
          <input type="number" min="0" step="any" value={q[r.id]} onChange={(e) => setQ({ ...q, [r.id]: e.target.value })} />
        </Field>
      ))}
      <button className="btn" onClick={save}>
        Save BOM
      </button>
    </Modal>
  )
}

export default function Inventory() {
  const { b, updB } = useStore()
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [bom, setBom] = useState(null)
  const v = useMemo(() => valuation(b), [b])

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Give the item a name.')
    setErr('')
    updB((x) =>
      x.items.push({
        id: uid(),
        name: f.name.trim(),
        type: f.type,
        unit: f.unit.trim() || 'pcs',
        hsn: f.hsn.trim(),
        open: +f.open || 0,
        openCost: +f.openCost || 0,
        rate: +f.rate || 0,
        bom: [],
      }),
    )
    setF(blank)
  }

  const setRate = (id, rate) => updB((x) => (x.items.find((i) => i.id === id).rate = +rate || 0))

  return (
    <>
      <div className="card">
        <h3>Stock</h3>
        <p className="muted">Stock is derived from opening + purchases + production − sales ± returns/rejects. Cost is moving average.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>HSN</th>
                <th className="r">In stock</th>
                <th className="r">Avg cost</th>
                <th className="r">Value</th>
                <th className="r">Sale rate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.items.map((i) => (
                <tr key={i.id} className={v.qty[i.id] < 0 ? 'neg' : ''}>
                  <td>{i.name}</td>
                  <td>{i.type === 'fg' ? 'Finished' : i.type === 'raw' ? 'Raw' : 'By-product'}</td>
                  <td>{i.hsn}</td>
                  <td className="r">
                    {qtyFmt(v.qty[i.id])} {i.unit}
                  </td>
                  <td className="r">{inr(v.avg[i.id])}</td>
                  <td className="r">{inr(v.val[i.id])}</td>
                  <td className="r">
                    {i.type !== 'raw' ? <input className="mini" type="number" min="0" step="any" value={i.rate} onChange={(e) => setRate(i.id, e.target.value)} /> : '—'}
                  </td>
                  <td className="r">
                    {i.type === 'fg' && (
                      <button className="btn ghost" onClick={() => setBom(i)}>
                        BOM
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td colSpan={5}>Closing stock value</td>
                <td className="r">{inr(v.closing)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        {b.items.length === 0 && <Empty>No items.</Empty>}
      </div>

      <form className="card" onSubmit={submit}>
        <h3>Add item</h3>
        <div className="grid">
          <Field label="Name">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="raw">Raw material</option>
              <option value="fg">Finished goods</option>
              <option value="scrap">By-product / scrap</option>
            </select>
          </Field>
          <Field label="Unit">
            <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </Field>
          <Field label="HSN">
            <input value={f.hsn} onChange={(e) => setF({ ...f, hsn: e.target.value })} />
          </Field>
          <Field label="Opening qty">
            <input type="number" min="0" step="any" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} />
          </Field>
          <Field label="Opening cost / unit">
            <input type="number" min="0" step="any" value={f.openCost} onChange={(e) => setF({ ...f, openCost: e.target.value })} />
          </Field>
          <Field label="Default sale rate">
            <input type="number" min="0" step="any" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </Field>
        </div>
        <ErrBar msg={err} />
        <button className="btn">Add item</button>
      </form>
      {bom && <BomEditor item={bom} onClose={() => setBom(null)} />}
    </>
  )
}
