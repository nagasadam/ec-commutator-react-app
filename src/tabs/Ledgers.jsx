import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { ledger } from '../lib/reports.js'
import { statementPdf, downloadBytes } from '../lib/pdf.js'
import { dmy, inr } from '../lib/format.js'
import { Empty, Field, Stat } from '../ui.jsx'
import { useToast } from '../toast.jsx'

export default function Ledgers() {
  const { b } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState('cust')
  const [id, setId] = useState('')
  const list = kind === 'cust' ? b.cust : b.sup
  const party = list.find((p) => p.id === id)
  const led = party ? ledger(b, party, kind) : null

  const pdf = () => {
    try {
      downloadBytes(statementPdf(b, party, kind, led), `${party.name.replace(/\W+/g, '-')}-statement.pdf`)
      toast.push('Statement PDF created', 'ok')
    } catch (e) {
      toast.push('Could not create the PDF: ' + (e?.message || e), 'err')
    }
  }

  return (
    <>
      <div className="card">
        <div className="grid">
          <Field label="Statement for">
            <select value={kind} onChange={(e) => (setKind(e.target.value), setId(''))}>
              <option value="cust">Customer</option>
              <option value="sup">Supplier</option>
            </select>
          </Field>
          <Field label="Party">
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Select…</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      {!led ? (
        <Empty>Choose a party to see the statement.</Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="Opening" n={led.opening} dot="c" />
            <Stat label={kind === 'cust' ? 'Billed' : 'Purchased'} n={led.debit} dot="a" />
            <Stat label={kind === 'cust' ? 'Received / credited' : 'Paid / debited'} n={led.credit} dot="good" />
            <Stat label="Closing" n={led.closing} dot="warn" sub={led.closing >= 0 ? (kind === 'cust' ? 'they owe you' : 'you owe them') : 'advance'} />
          </div>
          <div className="card">
            <h3>
              Statement <button className="btn" onClick={pdf}>Download PDF</button>
            </h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ref</th>
                    <th>Details</th>
                    <th className="r">Debit</th>
                    <th className="r">Credit</th>
                    <th className="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="dim">Opening balance</td>
                    <td className="r">{inr(led.opening)}</td>
                  </tr>
                  {led.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="nw">{dmy(r.date)}</td>
                      <td className="nw">{r.ref}</td>
                      <td>{r.text}</td>
                      <td className="r">{r.debit ? inr(r.debit) : ''}</td>
                      <td className="r">{r.credit ? inr(r.credit) : ''}</td>
                      <td className="r">{inr(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
