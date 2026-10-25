import { useEffect, useMemo, useRef } from 'react'
import { riseIn } from '../motion.jsx'
import { useStore } from '../lib/store.jsx'
import { calc, find, invTot, paidFor, srTot, valuation } from '../lib/calc.js'
import { monthly } from '../lib/reports.js'
import { dmy, inr } from '../lib/format.js'
import { Empty } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { useCountUp } from '../ui.jsx'

const Money = ({ n }) => {
  const t = inr(useCountUp(n))
  const i = t.lastIndexOf('.')
  return <>{i > 0 ? <>{t.slice(0, i)}<em>{t.slice(i)}</em></> : t}</>
}
const Num = ({ n }) => <>{Math.round(useCountUp(n)).toLocaleString('en-IN')}</>
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4)

export default function Dashboard({ go }) {
  const { b } = useStore()
  const root = useRef(null)
  useEffect(() => {
    const a = riseIn(root.current, '.card')
    return () => a?.stop()
  }, [])
  const c = useMemo(() => calc(b), [b])
  const v = useMemo(() => valuation(b), [b])
  const months = useMemo(() => monthly(b), [b])
  const prodByMonth = useMemo(() => {
    const m = {}
    b.prod.forEach((p) => (m[p.date.slice(0, 7)] = (m[p.date.slice(0, 7)] || 0) + (+p.qty || 0)))
    return m
  }, [b])

  const last6 = months.slice(-6)
  const cur = last6[last6.length - 1]
  const prev = last6[last6.length - 2]
  const maxS = Math.max(1, ...last6.map((m) => m.sales))
  const delta = cur && prev && prev.sales > 0 ? Math.round(((cur.sales - prev.sales) / prev.sales) * 100) : null

  const pm = Object.keys(prodByMonth).sort().slice(-6)
  const maxP = Math.max(1, ...pm.map((k) => prodByMonth[k]))
  const curP = pm.length ? prodByMonth[pm[pm.length - 1]] : 0
  const pct = Math.round((curP / maxP) * 100)
  const fg = b.items.filter((i) => i.type === 'fg')
  const fgQty = fg.reduce((s, i) => s + Math.max(0, v.qty[i.id] || 0), 0)

  const mx = Math.max(1, ...last6.map((m) => Math.max(m.sales, m.purchases + m.expenses)))
  const raws = b.items.filter((i) => i.type === 'raw').map((i) => ({ ...i, q: v.qty[i.id] || 0 })).sort((a, d) => a.q - d.q).slice(0, 5)
  const recent = [...b.inv].reverse().slice(0, 5)
  const gstTot = c.gstOut + c.gstIn
  const compoTot = c.cash + c.gpay + c.bankTotal
  const seg = (x) => (compoTot > 0 ? (Math.max(0, x) / compoTot) * 100 : 0)

  return (
    <div className="dash" ref={root}>
      <div className="dash-r1">
        <div className="card d-sales">
          <div className="ch"><span className="ico"><Icon n="rep" /></span>Sales<span className="tag">{cur ? label(cur.month) : 'This month'}</span></div>
          <div className="figs">
            <div className="big"><Money n={cur ? cur.sales : 0} /></div>
            <div className="trend">
              {delta != null && <span className={'pill ' + (delta >= 0 ? 'ok' : 'bad')}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>}
              <span>{delta != null ? 'vs last month' : 'net of credit notes'} · {inr(c.sales)} all time</span>
            </div>
          </div>
          <div className="minibars" aria-hidden="true">
            {last6.map((m) => <i key={m.month} style={{ height: Math.max(8, (m.sales / maxS) * 100) + '%' }} title={label(m.month)} />)}
          </div>
          <div className="acts">
            <button className="btn dark" onClick={() => go('inv', true)}>+ New invoice</button>
            <button className="btn ghost" onClick={() => go('rep')}>Reports</button>
          </div>
        </div>

        <div className="card d-recv">
          <div className="ch"><span className="ico"><Icon n="down" /></span>To receive</div>
          <div className="big"><Money n={c.receivable} /></div>
          <div className="s muted">{b.cust.length} customers · open invoices</div>
          <div className="compo"><i style={{ width: seg(c.bankTotal) + '%', background: 'var(--a)' }} /><i style={{ width: seg(c.cash) + '%', background: 'var(--b)' }} /><i style={{ width: seg(c.gpay) + '%', background: 'var(--c)' }} /></div>
          <div className="compo-l"><span><i style={{ background: 'var(--a)' }} />Bank {inr(c.bankTotal)}</span><span><i style={{ background: 'var(--b)' }} />Cash {inr(c.cash)}</span><span><i style={{ background: 'var(--c)' }} />GPay {inr(c.gpay)}</span></div>
        </div>

        <div className="card d-pay">
          <div className="ch"><span className="ico"><Icon n="up" /></span>To pay</div>
          <div className="big"><Money n={c.payable} /></div>
          <div className="s muted">owed to suppliers</div>
          <div className="who2">
            <div><small>Expenses</small><b>{inr(c.expenses)}</b></div>
            <div><small>Profit</small><b>{inr(c.profit)}</b></div>
          </div>
        </div>
      </div>

      <div className="dash-r2">
        <div className="stack">
          <div className="card d-prod">
            <div className="ch"><span className="ico"><Icon n="pro" /></span>Production<span className="tag" style={{ background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)' }}>{pm.length ? label(pm[pm.length - 1]) : 'No runs'}</span></div>
            <div className="gauge">
              <svg viewBox="0 0 200 110">
                <path className="trk" d="M15 100a85 85 0 01170 0" fill="none" strokeWidth="14" strokeLinecap="round" />
                <path className="arc b" pathLength="100" d="M15 100a85 85 0 01170 0" fill="none" strokeWidth="14" strokeLinecap="round" style={{ '--off': 100 - pct }} />
              </svg>
              <div className="mid"><small>Units this month</small><b><Num n={curP} /></b></div>
            </div>
            <div className="chipsrow"><span>{fgQty.toLocaleString('en-IN')} finished in stock</span><span>{b.prod.length} run{b.prod.length === 1 ? '' : 's'}</span></div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><span className="ico"><Icon n="rep" /></span>Sales vs spend<span className="tag">Last {last6.length || 0} month{last6.length === 1 ? '' : 's'}</span></div>
          {last6.length === 0 ? <Empty>No activity yet.</Empty> : (
            <>
              <div className="pairs">
                {last6.map((m) => {
                  const spend = m.purchases + m.expenses
                  return (
                    <div className="pair" key={m.month} tabIndex={0}>
                      <div className="tip"><b>{label(m.month)}</b><span><i style={{ background: 'var(--b)' }} />Sales {inr(m.sales)}</span><span><i style={{ background: 'var(--a)' }} />Spend {inr(spend)}</span></div>
                      <div className="col">
                        <i className="p" style={{ height: Math.max(3, (m.sales / mx) * 100) + '%' }} />
                        <i className="s" style={{ height: Math.max(3, (spend / mx) * 100) + '%' }} />
                      </div>
                      <small>{MON[+m.month.slice(5, 7) - 1]}</small>
                    </div>
                  )
                })}
              </div>
              <div className="leg inline"><span><i style={{ background: 'var(--b)' }} />Sales</span><span><i style={{ background: 'var(--a)' }} />Purchases + expenses</span></div>
            </>
          )}
        </div>

        <div className="stack">
          <div className="card d-gst">
            <div className="ch"><span className="ico"><Icon n="tax" /></span>GST</div>
            <div className="big"><Money n={Math.abs(c.gstNet)} /></div>
            <div className="sub">{c.gstNet >= 0 ? 'payable (output − input)' : 'credit carried (input − output)'}</div>
            <div className="split"><i style={{ width: (gstTot > 0 ? (c.gstOut / gstTot) * 100 : 50) + '%', background: 'var(--a)' }} /><i style={{ flex: 1, background: 'var(--b)' }} /></div>
            <div className="compo-l"><span><i style={{ background: 'var(--a)' }} />Output {inr(c.gstOut)}</span><span><i style={{ background: 'var(--b)' }} />Input {inr(c.gstIn)}</span></div>
          </div>
          <div className="card">
            <div className="ch"><span className="ico"><Icon n="warn" /></span>Lowest raw stock</div>
            {raws.length === 0 ? <p className="empty-dash">No raw materials.</p> : (
              <div className="low">
                {raws.map((r) => (
                  <div className="it" key={r.id}><span>{r.name}</span><b className={r.q < 0 ? 'muted bad' : ''}>{Math.round(r.q * 100) / 100} {r.unit}</b></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card d-recent">
        <div className="ch"><span className="ico"><Icon n="inv" /></span>Recent invoices<span className="tag" style={{ cursor: 'pointer' }} onClick={() => go('inv')}>View all</span></div>
        {recent.length === 0 ? <Empty>No invoices yet.</Empty> : (
          <div className="tw">
            <table>
              <thead><tr><th>No</th><th>Date</th><th>Customer</th><th className="r">Total</th><th>Status</th></tr></thead>
              <tbody>
                {recent.map((i) => {
                  const t = invTot(b, i)
                  const cn = b.sr.filter((s) => s.inv === i.id).reduce((s, r) => s + srTot(b, r).total, 0)
                  const open = t.total - cn - paidFor(b, i.id)
                  return (
                    <tr key={i.id}>
                      <td className="nw"><b>{i.no}</b></td>
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
    </div>
  )
}
