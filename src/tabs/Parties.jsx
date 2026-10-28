import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { custBals, supBals } from '../lib/calc.js'
import { inr, uid } from '../lib/format.js'
import { partyError } from '../lib/rules.js'
import { Empty, ErrBar, Field, useDialog } from '../ui.jsx'


function PartyBlock({ kind }) {
  const { b, updB } = useStore()
  const { ask, tell } = useDialog()
  const isCust = kind === 'cust'
  const list = isCust ? b.cust : b.sup
  const bals = useMemo(() => (isCust ? custBals(b) : supBals(b)), [b, isCust])
  const [f, setF] = useState({ name: '', company: true, gstin: '', phone: '', address: '', open: '' })
  const [err, setErr] = useState('')

  const used = (id) =>
    isCust ? b.inv.some((i) => i.cust === id) || b.tx.some((t) => t.party === id) : b.pur.some((p) => p.sup === id) || b.tx.some((t) => t.party === id)

  const submit = (e) => {
    e.preventDefault()
    const gstin = f.gstin.trim().toUpperCase()
    const bad = partyError(b, f)
    if (bad) return setErr(bad)
    setErr('')
    updB((x) => x[kind].push({ id: uid(), name: f.name.trim(), company: f.company, gstin: f.company ? gstin : '', phone: f.phone.trim(), address: f.address.trim(), open: +f.open || 0 }))
    setF({ name: '', company: true, gstin: '', phone: '', address: '', open: '' })
  }

  return (
    <div className="card">
      <h3>{isCust ? 'Customers' : 'Suppliers'}</h3>
      <form onSubmit={submit}>
        <div className="grid">
          <Field label="Name">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <select value={f.company ? 'firm' : 'person'} onChange={(e) => setF({ ...f, company: e.target.value === 'firm' })}>
              <option value="firm">Firm / company (GST 18%)</option>
              {b.kind !== 'firm' && <option value="person">Person (no GST)</option>}
            </select>
          </Field>
          {f.company && (
            <Field label="GSTIN">
              <input value={f.gstin} maxLength={15} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
            </Field>
          )}
          <Field label="Phone">
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Address" wide>
            <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="Opening balance">
            <input type="number" step="any" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} />
          </Field>
        </div>
        <ErrBar msg={err} />
        <button className="btn">Add</button>
      </form>
      {list.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>GSTIN</th>
                <th className="r">{isCust ? 'Receivable' : 'Payable'}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.company ? 'Firm' : 'Person'}</td>
                  <td>{p.gstin}</td>
                  <td className="r">{inr(bals.get(p.id) ?? 0)}</td>
                  <td className="r">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        if (used(p.id)) return tell('This party has transactions and cannot be deleted.')
                        ask(`Delete ${p.name}?`, () => updB((x) => (x[kind] = x[kind].filter((y) => y.id !== p.id))), 'Delete')
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Parties() {
  return (
    <div className="cols">
      <PartyBlock kind="cust" />
      <PartyBlock kind="sup" />
    </div>
  )
}
