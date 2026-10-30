import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { acctName, acctOptions } from '../lib/calc.js'
import { inr, today, uid, dmy, r2 } from '../lib/format.js'
import { Empty, ErrBar, Field, useDialog, useTableFilter, FilterBar } from '../ui.jsx'

const HEADS = ['Rent', 'Electricity', 'Wages', 'Freight', 'Packing', 'Repairs', 'Transport', 'Office', 'Other']

export default function Expenses() {
  const { b, updB } = useStore()
  const { ask } = useDialog()
  const [f, setF] = useState({ head: '', amt: '', acct: '', date: today(), note: '' })
  const [err, setErr] = useState('')
  const opts = acctOptions(b, null)
  const total = r2(b.exp.reduce((s, e) => s + e.amt, 0))
  const f2 = useTableFilter()
  const expRows = [...b.exp].reverse().filter((e) => f2.test(e.date, [e.head, e.note, acctName(b, e.acct), e.amt].join(' ')))

  const submit = (e) => {
    e.preventDefault()
    if (!f.head.trim() || !(+f.amt > 0) || !f.acct) return setErr('Enter a head, an amount and the account it was paid from.')
    setErr('')
    updB((x) => x.exp.push({ id: uid(), date: f.date, head: f.head.trim(), amt: +f.amt, acct: f.acct, note: f.note.trim() }))
    setF({ head: '', amt: '', acct: '', date: today(), note: '' })
  }

  return (
    <>
      <div className="work">
        <div className="main">
      <div className="card">
        <h3>Expenses · {inr(total)}{f2.active ? ` (filtered ${inr(expRows.reduce((n, e) => n + e.amt, 0))})` : ''}</h3>
        {b.exp.length > 0 && <FilterBar f={f2} label="expenses" shown={expRows.length} total={b.exp.length} />}
        {b.exp.length === 0 ? (
          <Empty>No expenses yet.</Empty>
        ) : (
          expRows.length === 0 ? <Empty>No expenses match.</Empty> : <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Head</th>
                  <th>Paid from</th>
                  <th>Note</th>
                  <th className="r">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expRows.map((e) => (
                  <tr key={e.id}>
                    <td>{dmy(e.date)}</td>
                    <td>{e.head}</td>
                    <td>{acctName(b, e.acct)}</td>
                    <td>{e.note}</td>
                    <td className="r">{inr(e.amt)}</td>
                    <td className="r">
                      <button className="btn ghost" onClick={() => ask('Delete this expense?', () => updB((x) => (x.exp = x.exp.filter((y) => y.id !== e.id))), 'Delete')}>
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
        </div>
        <div className="side">
      <form className="card" onSubmit={submit}>
        <h3>Add expense</h3>
        <div className="grid">
          <Field label="Head">
            <input list="heads" value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} />
            <datalist id="heads">
              {HEADS.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </Field>
          <Field label="Amount">
            <input type="number" min="0" step="any" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} />
          </Field>
          <Field label="Paid from">
            <select value={f.acct} onChange={(e) => setF({ ...f, acct: e.target.value })}>
              <option value="">Select…</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Note">
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </div>
        <ErrBar msg={err} />
        <button className="btn">Add</button>
      </form>
        </div>
      </div>
    </>
  )
}
