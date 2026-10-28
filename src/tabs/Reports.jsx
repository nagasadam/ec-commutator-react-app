import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { calc, custBals, find, invTot, paidFor, srTot, supBals } from '../lib/calc.js'
import { GUIDE } from '../lib/seed.js'
import { dmy, inr } from '../lib/format.js'
import { Empty, Stat } from '../ui.jsx'
import { BalanceSheet, Daybook, MonthlyChart, TrialBalance } from './Statements.jsx'

const LABELS = {
  sales: 'Sales (net of returns)',
  profit: 'Profit',
  receivable: 'Receivable',
  payable: 'Payable',
  bankTotal: 'Bank',
  cash: 'Cash',
  gpay: 'GPay',
  closingStock: 'Closing stock',
  gstOut: 'GST output',
  gstIn: 'GST input',
}
const PAL = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--warn)']

function Overview() {
  const { b } = useStore()
  const c = useMemo(() => calc(b), [b])
  const pct = (x) => (c.sales > 0 ? Math.round((x / c.sales) * 1000) / 10 : 0)
  const cBal = useMemo(() => custBals(b), [b])
  const sBal = useMemo(() => supBals(b), [b])
  const supCount = [...sBal.values()].filter((x) => x > 0).length

  // money on hand: one donut slice per account (negative balances draw no slice)
  const accts = [...b.banks.map((k) => ({ label: k.name, val: c.banks[k.id] })), { label: 'Cash', val: c.cash }, { label: 'GPay', val: c.gpay }]
  const total = accts.reduce((s, a) => s + a.val, 0)
  const pos = accts.map((a) => Math.max(0, a.val))
  const posTot = pos.reduce((s, v) => s + v, 0)
  let acc = 0
  const stops =
    posTot > 0
      ? pos
          .map((v, i) => {
            const from = (acc / posTot) * 100
            acc += v
            return `${PAL[i % PAL.length]} ${from}% ${(acc / posTot) * 100}%`
          })
          .join(', ')
      : 'var(--glass2) 0% 100%'

  const gstTot = c.gstOut + c.gstIn
  const outPct = gstTot > 0 ? (c.gstOut / gstTot) * 100 : 50
  const recent = [...b.inv].reverse().slice(0, 6)

  return (
    <>
      <div className="stats k6">
        <Stat label="Sales" n={c.sales} dot="a" meter={c.sales > 0 ? 100 : 0} sub={`${b.inv.length} invoice${b.inv.length === 1 ? '' : 's'}, net of credit notes`} />
        <Stat label="Profit" n={c.profit} dot="good" tone={(c.profit < 0 ? 'bad ' : '') + 'hero'} meter={pct(c.profit)} sub={`${pct(c.profit)}% of sales`} />
        <Stat label="Receivable" n={c.receivable} dot="warn" meter={pct(c.receivable)} sub={`${pct(c.receivable)}% of sales still to collect`} />
        <Stat label="Payable" n={c.payable} dot="b" meter={pct(c.payable)} sub={`owed to ${supCount} supplier${supCount === 1 ? '' : 's'}`} />
        <Stat label="Closing stock" n={c.closingStock} dot="c" sub="valued at average cost" />
        <Stat label="Expenses" n={c.expenses} dot="warn" meter={pct(c.expenses)} sub={`${pct(c.expenses)}% of sales`} />
      </div>

      <div className="two">
        <div className="card">
          <h3>
            Invoices &amp; bills <span>{b.inv.length} record{b.inv.length === 1 ? '' : 's'}</span>
          </h3>
          {recent.length === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            <div className="tw">
              <table className="rt">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th className="r">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((i) => {
                    const t = invTot(b, i)
                    const cn = b.sr.filter((s) => s.inv === i.id).reduce((s, r) => s + srTot(b, r).total, 0)
                    const open = t.total - cn - paidFor(b, i.id)
                    return (
                      <tr key={i.id}>
                        <td className="nw">
                          <b>{i.no}</b>
                        </td>
                        <td className="dim nw">{dmy(i.date)}</td>
                        <td>{find(b.cust, i.cust)?.name}</td>
                        <td className="r nw">{inr(t.total)}</td>
                        <td>{open < 0.5 ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3>
            Money on hand <span>{inr(total)} total</span>
          </h3>
          <div className="donut">
            <div className="wrap">
              <div className="dring" style={{ background: `conic-gradient(${stops})` }} />
              <div className="ctr">
                <small>Total</small>
                <b>{inr(total)}</b>
              </div>
            </div>
            <div className="leg">
              {accts.map((a, i) => (
                <div className="lr" key={a.label + i}>
                  <i style={{ background: PAL[i % PAL.length] }} />
                  {a.label}
                  <b>{inr(a.val)}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="gst">
            <h3 style={{ marginBottom: 10 }}>GST summary</h3>
            <div className="split">
              <i style={{ width: `${outPct}%`, background: 'var(--a)' }} />
              <i style={{ flex: 1, background: 'var(--b)' }} />
            </div>
            <div className="g">
              <span className="lbl">Output GST (sales − credit notes)</span>
              <b>{inr(c.gstOut)}</b>
            </div>
            <div className="g">
              <span className="lbl">Input GST (purchases − debit notes)</span>
              <b>{inr(c.gstIn)}</b>
            </div>
            <div className="g tot">
              <span>{c.gstNet >= 0 ? 'Net GST payable' : 'Net input credit'}</span>
              <b>{inr(Math.abs(c.gstNet))}</b>
            </div>
          </div>
        </div>
      </div>

      <MonthlyChart />

      <div className="card">
        <h3>Outstanding</h3>
        <div className="tw">
          <table>
            <tbody>
              {b.cust.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name} <span className="dim">· customer</span>
                  </td>
                  <td className="r">{inr(cBal.get(p.id) ?? 0)}</td>
                </tr>
              ))}
              {b.sup.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name} <span className="dim">· supplier</span>
                  </td>
                  <td className="r">{inr(sBal.get(p.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {b.demo && (
        <div className="card">
          <h3>Guide check <span>E.C Commutators demo</span></h3>
          <p className="muted">Computed figures against the expected values in the notes.</p>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Figure</th>
                  <th className="r">Expected</th>
                  <th className="r">Computed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(GUIDE).map(([k, want]) => {
                  const ok = Math.abs(c[k] - want) < 0.005
                  return (
                    <tr key={k}>
                      <td>{LABELS[k]}</td>
                      <td className="r">{inr(want)}</td>
                      <td className="r">{inr(c[k])}</td>
                      <td>{ok ? <span className="pill ok">Match</span> : <span className="pill warn">Differs</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

const VIEWS = [
  ['ov', 'Overview', Overview],
  ['day', 'Daybook', Daybook],
  ['bs', 'Balance sheet', BalanceSheet],
  ['tb', 'Trial balance', TrialBalance],
]

export default function Reports() {
  const [v, setV] = useState('ov')
  const Cur = VIEWS.find((x) => x[0] === v)[2]
  return (
    <>
      <div className="seg" role="tablist">
        {VIEWS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={id === v} className={id === v ? 'on' : ''} onClick={() => setV(id)}>
            {l}
          </button>
        ))}
      </div>
      <Cur />
    </>
  )
}
