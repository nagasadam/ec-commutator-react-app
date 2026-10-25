import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { acctBal, acctName, acctOptions, custBal, find, supBal } from '../lib/calc.js'
import { inr, today, uid, dmy } from '../lib/format.js'
import { settleError } from '../lib/rules.js'
import { Empty, ErrBar, Field, Stat, useDialog } from '../ui.jsx'

function Settle({ kind }) {
  const { b, updB } = useStore()
  const recv = kind === 'recv'
  const parties = recv ? b.cust : b.sup
  const refs = recv ? b.inv : b.pur
  const refParty = (r) => (recv ? r.cust : r.sup)
  const [f, setF] = useState({ party: '', amt: '', acct: '', date: today(), ref: '' })
  const [err, setErr] = useState('')
  const party = find(parties, f.party)
  const opts = acctOptions(b, party)

  const submit = (e) => {
    e.preventDefault()
    const bad = settleError(b, party, f.acct, f.amt)
    if (bad) return setErr(bad)
    setErr('')
    updB((x) => x.tx.push({ id: uid(), date: f.date, kind, party: f.party, amt: +f.amt, acct: f.acct, ref: f.ref }))
    setF({ party: '', amt: '', acct: '', date: today(), ref: '' })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{recv ? 'Receive from customer' : 'Pay supplier'}</h3>
      <div className="grid">
        <Field label={recv ? 'Customer' : 'Supplier'}>
          <select value={f.party} onChange={(e) => setF({ ...f, party: e.target.value, acct: '', ref: '' })}>
            <option value="">Select…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (owes {inr(Math.max(0, (recv ? custBal : supBal)(b, p)))})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input type="number" min="0" step="any" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} />
        </Field>
        <Field label="Account">
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
        <Field label={recv ? 'Against invoice (optional)' : 'Against purchase (optional)'}>
          <select value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })}>
            <option value="">On account</option>
            {refs
              .filter((r) => refParty(r) === f.party)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.no}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <ErrBar msg={err} />
      <button className="btn">{recv ? 'Record receipt' : 'Record payment'}</button>
    </form>
  )
}

export default function Banking() {
  const { b, updB } = useStore()
  const { ask } = useDialog()
  const [bank, setBank] = useState({ name: '', open: '' })

  const addBank = (e) => {
    e.preventDefault()
    if (!bank.name.trim()) return
    updB((x) => x.banks.push({ id: uid(), name: bank.name.trim(), open: +bank.open || 0 }))
    setBank({ name: '', open: '' })
  }

  return (
    <>
      <div className="stats">
        {b.banks.map((k) => (
          <Stat key={k.id} label={k.name} n={acctBal(b, k.id)} />
        ))}
        <Stat label="Cash" n={acctBal(b, 'cash')} />
        <Stat label="GPay" n={acctBal(b, 'gpay')} />
      </div>

      <div className="cols">
      <div className="card">
        <h3>Accounts &amp; opening balances</h3>
        <div className="grid">
          <Field label="Cash opening">
            <input type="number" step="any" value={b.cashOpen} onChange={(e) => updB((x) => (x.cashOpen = +e.target.value || 0))} />
          </Field>
          <Field label="GPay opening">
            <input type="number" step="any" value={b.gpayOpen} onChange={(e) => updB((x) => (x.gpayOpen = +e.target.value || 0))} />
          </Field>
        </div>
        <form onSubmit={addBank}>
          <div className="grid">
            <Field label="New bank account">
              <input value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} />
            </Field>
            <Field label="Opening balance">
              <input type="number" step="any" value={bank.open} onChange={(e) => setBank({ ...bank, open: e.target.value })} />
            </Field>
          </div>
          <button className="btn">Add bank</button>
        </form>
      </div>
      <Settle kind="recv" />
      <Settle kind="pay" />
      </div>

      <div className="card">
        <h3>Receipts &amp; payments</h3>
        {b.tx.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Account</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...b.tx]
                  .sort((a, c) => (a.date < c.date ? 1 : -1))
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{dmy(t.date)}</td>
                      <td>{find(b.cust, t.party)?.name || find(b.sup, t.party)?.name}</td>
                      <td>{acctName(b, t.acct)}</td>
                      <td className="r">{t.kind === 'recv' ? inr(t.amt) : ''}</td>
                      <td className="r">{t.kind === 'pay' ? inr(t.amt) : ''}</td>
                      <td className="r">
                        <button className="btn ghost" onClick={() => ask('Delete this entry?', () => updB((x) => (x.tx = x.tx.filter((y) => y.id !== t.id))), 'Delete')}>
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
    </>
  )
}
