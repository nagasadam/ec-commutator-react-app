import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { find, valuation } from '../lib/calc.js'
import { inr, qtyFmt, today, uid, dmy } from '../lib/format.js'
import { TYPES, itemId, ensureProcessItems } from '../lib/process.js'
import { Empty, ErrBar, Field, useDialog, useTableFilter, FilterBar, usePaged, MoreRows } from '../ui.jsx'

export default function Production() {
  const { b, updB } = useStore()
  const { ask } = useDialog()
  const fgs = b.items.filter((i) => i.type === 'fg')
  const [f, setF] = useState({ item: '', qty: '', date: today() })
  const [err, setErr] = useState('')
  const v = useMemo(() => valuation(b), [b])
  const pitems = useMemo(() => {
    const w = structuredClone({ items: b.items })
    ensureProcessItems(w)
    return w.items
  }, [b.items])
  const tf = useTableFilter()
  const runs = [...b.prod].reverse().filter((r) => tf.test(r.date, find(b.items, r.item)?.name))
  const pg = usePaged(runs, tf.key)

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
        <h3>Bill of materials</h3>
        <p className="muted">Per piece. Stacking (outsourced) uses copper segments, mica segments and a plastic bush. Moulding uses the stack and moulding compound; the bush is already in the stack. Change amounts in Inventory (BOM on each "In process" item).</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Stacking BOM</th>
                <th>Moulding BOM</th>
              </tr>
            </thead>
            <tbody>
              {TYPES.map((t) => {
                const list = (id) => {
                  const it = find(pitems, id)
                  return it ? it.bom.map((m) => `${find(pitems, m.item)?.name || m.item} ${qtyFmt(m.qty)}`).join(', ') : '—'
                }
                return (
                  <tr key={t.id}>
                    <td className="nm">{t.name}</td>
                    <td data-l="Stacking BOM">{list(itemId('stk', t.id))}</td>
                    <td data-l="Moulding BOM">{list(itemId('mld', t.id))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Production runs</h3>
        {b.prod.length > 0 && <FilterBar f={tf} label="production" shown={runs.length} total={b.prod.length} />}
        {b.prod.length === 0 ? (
          <Empty>No production yet.</Empty>
        ) : (
          runs.length === 0 ? <Empty>No runs match.</Empty> : <div className="tw">
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
                {pg.shown.map((r) => {
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
        <MoreRows pg={pg} />
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
