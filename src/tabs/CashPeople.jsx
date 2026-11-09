import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { cashPeople, togglePin } from '../lib/reports.js'
import { inr } from '../lib/format.js'
import { Empty, useTableFilter, FilterBar } from '../ui.jsx'

const MODES = [['all', 'All'], ['cash', 'Cash'], ['gpay', 'GPay'], ['pin', '★ Pinned']]
const initials = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

// What one person moved, for the chosen filter: in, out and net (received minus paid).
const flow = (p, mode) => {
  const cin = mode === 'gpay' ? 0 : p.cashIn
  const cout = mode === 'gpay' ? 0 : p.cashOut
  const gin = mode === 'cash' ? 0 : p.gpayIn
  const gout = mode === 'cash' ? 0 : p.gpayOut
  return { cin, cout, gin, gout, net: cin + gin - cout - gout }
}
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + inr(Math.abs(n))

// View only: built from existing Cash/GPay receipts and payments, plus pinned parties.
export default function CashPeople() {
  const { b, updB } = useStore()
  const tf = useTableFilter()
  const [mode, setMode] = useState('all')
  const allRows = cashPeople(b)
  const has = (p) => p.cashIn || p.cashOut || p.gpayIn || p.gpayOut
  const rows = allRows
    .filter((p) => tf.test('', p.name))
    .filter((p) => (mode === 'pin' ? p.pinned : mode === 'all' ? true : mode === 'cash' ? p.cashIn || p.cashOut : p.gpayIn || p.gpayOut))
  const all = [...b.cust, ...b.sup].filter((p) => !allRows.some((r) => r.id === p.id))
  const fm = mode === 'pin' ? 'all' : mode
  const sum = (k) => allRows.reduce((s, p) => s + flow(p, k).net, 0)
  const cashNet = sum('cash')
  const gpayNet = sum('gpay')
  const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
  return (
    <>
      <div className="cp-tiles">
        <div className="cp-tile lime">
          <small>Cash net</small>
          <b className={tone(cashNet)}>{signed(cashNet)}</b>
        </div>
        <div className="cp-tile dark">
          <small>GPay net</small>
          <b className={tone(gpayNet)}>{signed(gpayNet)}</b>
        </div>
      </div>
      <div className="card">
        <h3>Cash &amp; GPay people <span>{rows.length}</span></h3>
        <div className="cp-seg" role="tablist" aria-label="Show">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {allRows.length > 6 && <FilterBar f={tf} label="people" dates={false} shown={rows.length} total={allRows.length} />}
        {allRows.length === 0 ? (
          <Empty>No cash or GPay receipts or payments yet. Pin someone below to keep them here.</Empty>
        ) : rows.length === 0 ? (
          <Empty>{mode === 'pin' && !tf.active ? 'No pinned people yet.' : 'No match.'}</Empty>
        ) : (
          <ul className="cp-list">
            {rows.map((p) => {
              const f = flow(p, fm)
              const chips = [
                ['cash', 'Cash in', f.cin],
                ['cash', 'Cash out', f.cout],
                ['gpay', 'GPay in', f.gin],
                ['gpay', 'GPay out', f.gout],
              ].filter((c) => c[2])
              return (
                <li key={p.id} className="cp-row">
                  <span className="cp-av" aria-hidden="true">{initials(p.name)}</span>
                  <div className="cp-main">
                    <div className="cp-name">{p.name}</div>
                    {chips.length ? (
                      <div className="cp-chips">
                        {chips.map(([k, l, v]) => (
                          <span key={l} className="cp-chip"><i className={k} />{l} {inr(v)}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="cp-sub">{has(p) ? 'Nothing in this view' : 'No cash or GPay yet'}</div>
                    )}
                  </div>
                  <div className="cp-net">
                    {chips.length ? (
                      <>
                        <b className={tone(f.net)}>{signed(f.net)}</b>
                        <small>{f.net > 0 ? 'received' : f.net < 0 ? 'paid' : 'even'}</small>
                      </>
                    ) : (
                      <small>—</small>
                    )}
                  </div>
                  <button type="button" className="cp-pin" aria-label={(p.pinned ? 'Unpin ' : 'Pin ') + p.name} onClick={() => updB((x) => togglePin(x, p.id))}>
                    {p.pinned ? '★' : '☆'}
                  </button>
                </li>
              )
            })}
          </ul>
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
