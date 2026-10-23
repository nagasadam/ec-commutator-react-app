import { useStore } from '../lib/store.jsx'
import { balanceSheet, daybook, monthly, trialBalance } from '../lib/reports.js'
import { dmy, inr } from '../lib/format.js'
import { Empty } from '../ui.jsx'

export function MonthlyChart() {
  const { b } = useStore()
  const m = monthly(b)
  if (!m.length) return null
  const max = Math.max(1, ...m.flatMap((x) => [x.sales, x.purchases, x.expenses]))
  return (
    <div className="card">
      <h3>Month by month <span>excl. GST</span></h3>
      <div className="bars" role="img" aria-label="Sales, purchases and expenses by month">
        {m.map((x) => (
          <div className="bgrp" key={x.month}>
            <div className="bcols">
              {[['sales', 'var(--a)'], ['purchases', 'var(--b)'], ['expenses', 'var(--warn)']].map(([k, c]) => (
                <i key={k} title={`${k}: ${inr(x[k])}`} style={{ height: Math.max(2, (Math.max(0, x[k]) / max) * 100) + '%', background: c }} />
              ))}
            </div>
            <small>{x.month}</small>
          </div>
        ))}
      </div>
      <div className="leg inline">
        <span><i style={{ background: 'var(--a)' }} />Sales</span>
        <span><i style={{ background: 'var(--b)' }} />Purchases</span>
        <span><i style={{ background: 'var(--warn)' }} />Expenses</span>
      </div>
    </div>
  )
}

export function Daybook() {
  const { b } = useStore()
  const d = daybook(b)
  return (
    <div className="card">
      <h3>Daybook <span>{d.length} entries</span></h3>
      {d.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Ref</th>
                <th>Party / item</th>
                <th className="r">Amount</th>
                <th className="r">Cash &amp; bank</th>
              </tr>
            </thead>
            <tbody>
              {d.map((x, i) => (
                <tr key={i}>
                  <td className="nw">{dmy(x.date)}</td>
                  <td>{x.type}</td>
                  <td className="nw">{x.ref}</td>
                  <td>{x.who}</td>
                  <td className="r">{['Production', 'Reject'].includes(x.type) ? x.amount + ' pcs' : inr(x.amount)}</td>
                  <td className="r">{x.money ? inr(x.money) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const Side = ({ title, rows, total }) => (
  <div className="card">
    <h3>{title}</h3>
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="r">{inr(r.amt)}</td>
          </tr>
        ))}
        <tr className="tot">
          <td>Total</td>
          <td className="r">{inr(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
)

export function BalanceSheet() {
  const { b } = useStore()
  const s = balanceSheet(b)
  return (
    <>
      <div className="two">
        <Side title="Assets" rows={s.assets} total={s.totalAssets} />
        <div>
          <Side title="Liabilities" rows={s.liabilities} total={s.totalLiab} />
          <Side title="Owner's equity" rows={s.equity} total={s.totalEquity} />
        </div>
      </div>
      <p className={'muted ' + (s.balanced ? '' : 'bad')}>{s.balanced ? 'Assets equal liabilities plus equity.' : 'Does not balance: please report this.'}</p>
    </>
  )
}

export function TrialBalance() {
  const { b } = useStore()
  const t = trialBalance(b)
  return (
    <div className="card">
      <h3>Trial balance <span>before closing stock</span></h3>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="r">Debit</th>
              <th className="r">Credit</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className="r">{l.dr ? inr(l.dr) : ''}</td>
                <td className="r">{l.cr ? inr(l.cr) : ''}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total</td>
              <td className="r">{inr(t.dr)}</td>
              <td className="r">{inr(t.cr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={'muted ' + (t.balanced ? '' : 'bad')}>{t.balanced ? 'Debits equal credits.' : 'Does not balance: please report this.'}</p>
    </div>
  )
}
