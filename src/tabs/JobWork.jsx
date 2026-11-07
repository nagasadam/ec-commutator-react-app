import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { find } from '../lib/calc.js'
import { TYPES, typeName } from '../lib/process.js'
import { inr, qtyFmt, dmy, r2 } from '../lib/format.js'
import { Empty, Field, Modal, useDialog, useTableFilter, FilterBar, usePaged, MoreRows } from '../ui.jsx'

// Vendor job-work bills made when stacked pieces come back from a vendor (see process.js). Job work carries no GST:
// a bill is just good pieces x rate. Drafts do nothing until approved; approved bills are owed to the vendor.
const STATUS = { draft: 'Draft', approved: 'To pay' }

function BillEditor({ bill, onClose }) {
  const { b, updB } = useStore()
  const [f, setF] = useState({ pcs: String(bill.pcs), rate: String(bill.rate), amount: String(bill.amount), vbill: bill.vbill || '' })
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  // typing pieces or rate re-works the amount; the amount can still be typed over
  const calc = (pcs, rate) => String(r2((+pcs || 0) * (+rate || 0)))
  const save = () => {
    updB((x) => {
      const j = x.jw.find((y) => y.id === bill.id)
      if (!j || j.status !== 'draft') return
      j.pcs = +f.pcs || 0
      j.rate = +f.rate || 0
      j.amount = r2(+f.amount || 0)
      j.vbill = f.vbill.trim()
    })
    onClose()
  }
  return (
    <Modal title={`Edit ${bill.no}`} onClose={onClose}>
      <p className="muted">
        {find(b.sup, bill.sup)?.name || 'Vendor'} · lot {bill.lot} · {typeName(bill.type)} · sent {qtyFmt(bill.expected)}, short {qtyFmt(bill.short)}
      </p>
      <div className="grid">
        <Field label="Good pieces">
          <input type="number" min="0" step="any" value={f.pcs} onChange={(e) => setF({ ...f, pcs: e.target.value, amount: calc(e.target.value, f.rate) })} />
        </Field>
        <Field label="Rate per piece (₹)">
          <input type="number" min="0" step="any" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value, amount: calc(f.pcs, e.target.value) })} />
        </Field>
        <Field label="Amount (₹, no GST)">
          <input type="number" min="0" step="any" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <Field label="Vendor bill no.">
          <input value={f.vbill} onChange={(e) => set('vbill', e.target.value)} />
        </Field>
      </div>
      <button className="btn" onClick={save}>Save</button>
    </Modal>
  )
}

export default function JobWork() {
  const { b, updB } = useStore()
  const { ask } = useDialog()
  const [edit, setEdit] = useState(null)
  const tf = useTableFilter()
  const bills = useMemo(() => [...(b.jw || [])].reverse().filter((j) => tf.test(j.date, [j.no, j.lot, find(b.sup, j.sup)?.name, typeName(j.type)].join(' '))), [b.jw, b.sup, tf])
  const pg = usePaged(bills, tf.key)
  const owed = (b.jw || []).filter((j) => j.status === 'approved').reduce((s, j) => s + j.amount, 0)
  const drafts = (b.jw || []).filter((j) => j.status === 'draft').length

  const approve = (j) => {
    if (!j.sup) return ask('This bill has no vendor, so it cannot be approved. Delete it and record the lot again with a vendor.')
    ask(`Approve ${j.no} for ${inr(j.amount)}? It will be added to what you owe ${find(b.sup, j.sup)?.name || 'the vendor'}.`, () => updB((x) => (x.jw.find((y) => y.id === j.id).status = 'approved')), 'Approve')
  }
  const del = (j) => ask(`Delete draft ${j.no}?`, () => updB((x) => (x.jw = x.jw.filter((y) => y.id !== j.id))), 'Delete')
  const setRate = (t, v) => updB((x) => (x.pscan.rates[t] = +v || 0))

  return (
    <div className="work">
      <div className="main">
        <div className="card">
          <h3>Job-work bills</h3>
          <p className="muted">
            Made when a stacking lot is received from a vendor. Job work has no GST. Draft bills: {drafts}. Owed to vendors on approved bills: {inr(owed)}. Pay vendors in Banking, like any payment.
          </p>
          {(b.jw || []).length > 0 && <FilterBar f={tf} label="bills" shown={bills.length} total={b.jw.length} />}
          {(b.jw || []).length === 0 ? (
            <Empty>No job-work bills yet. One is made when a received lot has a job-work rate or charge.</Empty>
          ) : bills.length === 0 ? (
            <Empty>No bills match.</Empty>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bill</th>
                    <th>Vendor</th>
                    <th>Lot · type</th>
                    <th className="r">Pieces</th>
                    <th className="r">Rate</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pg.shown.map((j) => (
                    <tr key={j.id}>
                      <td className="jw-date">{dmy(j.date)}</td>
                      <td className="nm">
                        {j.no}
                        {j.vbill && <div className="muted">{j.vbill}</div>}
                      </td>
                      <td>{find(b.sup, j.sup)?.name || '—'}</td>
                      <td>
                        {j.lot} · {typeName(j.type)}
                      </td>
                      <td className="r">{qtyFmt(j.pcs)}</td>
                      <td className="r">{inr(j.rate)}</td>
                      <td className="r">{inr(j.amount)}</td>
                      <td>{STATUS[j.status] || j.status}</td>
                      <td className="r">
                        {j.status === 'draft' && (
                          <span className="rowact jw-act">
                            <button className="btn ghost" onClick={() => setEdit(j)}>Edit</button>
                            <button className="btn" onClick={() => approve(j)}>Approve</button>
                            <button className="btn ghost" onClick={() => del(j)}>Delete</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <MoreRows pg={pg} />
        </div>
      </div>
      <div className="side">
        <div className="card">
          <h3>Job-work rate per piece</h3>
          <p className="muted">Charged on good pieces received. The scan can still carry its own charge. Rupees, no GST.</p>
          <div className="grid">
            {TYPES.map((t) => (
              <Field key={t.id} label={t.name}>
                <input type="number" min="0" step="any" value={b.pscan?.rates?.[t.id] ?? 0} onChange={(e) => setRate(t.id, e.target.value)} />
              </Field>
            ))}
          </div>
        </div>
      </div>
      {edit && <BillEditor bill={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
