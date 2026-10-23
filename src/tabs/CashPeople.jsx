import { useStore } from '../lib/store.jsx'
import { cashPeople, togglePin } from '../lib/reports.js'
import { inr } from '../lib/format.js'
import { Empty } from '../ui.jsx'

// View only: built from existing Cash/GPay receipts and payments, plus pinned parties.
export default function CashPeople() {
  const { b, updB } = useStore()
  const rows = cashPeople(b)
  const all = [...b.cust, ...b.sup].filter((p) => !rows.some((r) => r.id === p.id))
  return (
    <>
      <div className="card">
        <h3>Cash &amp; GPay people <span>{rows.length}</span></h3>
        {rows.length === 0 ? (
          <Empty>No cash or GPay receipts or payments yet. Pin someone below to keep them here.</Empty>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Person</th>
                  <th className="r">Cash in</th>
                  <th className="r">Cash out</th>
                  <th className="r">GPay in</th>
                  <th className="r">GPay out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button className="btn ghost" aria-label={(p.pinned ? 'Unpin ' : 'Pin ') + p.name} onClick={() => updB((x) => togglePin(x, p.id))}>
                        {p.pinned ? '★' : '☆'}
                      </button>
                    </td>
                    <td>{p.name}</td>
                    <td className="r">{p.cashIn ? inr(p.cashIn) : ''}</td>
                    <td className="r">{p.cashOut ? inr(p.cashOut) : ''}</td>
                    <td className="r">{p.gpayIn ? inr(p.gpayIn) : ''}</td>
                    <td className="r">{p.gpayOut ? inr(p.gpayOut) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {all.length > 0 && (
        <div className="card">
          <h3>Pin a party</h3>
          <div className="chips">
            {all.map((p) => (
              <button key={p.id} className="btn ghost" onClick={() => updB((x) => togglePin(x, p.id))}>
                ☆ {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
