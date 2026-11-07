import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useCloud } from '../cloud.jsx'
import { useScans } from '../scanbridge.jsx'
import { valuation } from '../lib/calc.js'
import { TYPES, PROCESSES, itemId, typeName, previewScan, ensureProcessItems, qrText, bizTag, pairText } from '../lib/process.js'
import { qrSvg } from '../lib/qrcode.js'
import { qtyFmt, dmy, inr } from '../lib/format.js'
import { Empty, Modal, useDialog } from '../ui.jsx'

const when = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : `${dmy(iso.slice(0, 10))} ${d.toTimeString().slice(0, 5)}`
}
const describe = (s) => {
  if (!s) return 'Unreadable scan'
  const t = typeName(s.type)
  if (s.action === 'issue') return `${s.lot} · ${t} issued to vendor · ${qtyFmt(s.qty)} pcs expected`
  if (s.action === 'receive') return `${s.lot} · ${t} received ${qtyFmt(s.qty)} good${+s.rejects ? `, ${qtyFmt(s.rejects)} rejected` : ''}${+s.bushRejects ? ` · ${qtyFmt(s.bushRejects)} bushes rejected` : ''}${+s.charge ? ` · charge ₹${qtyFmt(s.charge)}` : ''}`
  return `${t} moulded ${qtyFmt(s.qty)} good${+s.rejects ? `, ${qtyFmt(s.rejects)} rejects` : ''}${+s.bushRejects ? ` · ${qtyFmt(s.bushRejects)} bushes rejected` : ''}${s.note ? ` · ${s.note}` : ''}`
}

function Posters({ b, onClose }) {
  const tag = bizTag(b.id)
  const items = [
    ['STACKING', 'Outsourced · issue to the vendor, receive stacked pieces back', qrText(tag, 'stacking')],
    ['MOULDING', 'In-house · record a run: pieces made and rejects', qrText(tag, 'moulding')],
    ['PAIR A PHONE', 'Scan this in the Process Scan app on first use', pairText(b.id)],
  ]
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<!doctype html><title>Process QR posters</title><style>body{font-family:system-ui,sans-serif;margin:0}.p{page-break-after:always;text-align:center;padding:48px}h1{font-size:56px;margin:16px 0}p{font-size:20px;color:#444}small{display:block;margin-top:24px;color:#777;font-family:monospace}</style>` +
        items.map(([h, d, t]) => `<div class="p"><p>${b.name.replace(/</g, '&lt;')}</p>${qrSvg(t, 520)}<h1>${h}</h1><p>${d}</p><small>${t.replace(/</g, '&lt;')}</small></div>`).join(''),
    )
    w.document.close()
    w.focus()
    w.print()
  }
  return (
    <Modal title="QR posters" onClose={onClose} wide>
      <p className="muted">Print the first two once and stick them at the vendor counter and by the press. They never change. The third is only for linking a phone.</p>
      <div className="ps-posters">
        {items.map(([h, d, t]) => (
          <div key={h} className="ps-poster">
            <div dangerouslySetInnerHTML={{ __html: qrSvg(t, 160) }} />
            <b>{h}</b>
            <span className="muted">{d}</span>
          </div>
        ))}
      </div>
      <p className="muted">Shop-floor people are added in the "Shop-floor phones" card on this page.</p>
      <button className="btn" onClick={print}>Print</button>
    </Modal>
  )
}

// Who may use the phone app for this business. The office adds and removes people here; the app writes the
// scanallow documents with the right business id, so nothing is edited by hand in the Firebase console.
function Scanners({ bizId }) {
  const cloud = useCloud()
  const api = cloud.scanners
  const [list, setList] = useState(null)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask } = useDialog()
  const load = async () => {
    try {
      setList(await api.list(bizId))
      setErr('')
    } catch (e) {
      setErr(e?.message || 'Could not load the list')
    }
  }
  useEffect(() => {
    if (api && cloud.user) load()
  }, [api, cloud.user, bizId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cloud.configured || !cloud.user || !api) return null
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (e) {
      setErr(e?.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card">
      <h3>Shop-floor phones</h3>
      <p className="muted">People who can sign in to the phone app and send scans for this business. Create their login first in Firebase Authentication (Users), then add the same email here.</p>
      <form
        className="ps-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) run(async () => { await api.add(bizId, email); setEmail('') })
        }}
      >
        <input type="email" aria-label="Shop-floor email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !valid}>Add</button>
      </form>
      {err && <div className="err">{err}</div>}
      {list && !list.length && <Empty>No shop-floor people added yet.</Empty>}
      {list?.map((x) => (
        <div className="it" key={x.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span>{x.email}</span>
          <button className="btn ghost" disabled={busy} onClick={() => ask(`Remove ${x.email}? They will no longer be able to send scans.`, () => run(() => api.remove(x.email)), 'Remove')}>Remove</button>
        </div>
      ))}
    </div>
  )
}

export default function ProcessScan() {
  const { b, updB } = useStore()
  const cloud = useCloud()
  const sc = useScans()
  const { ask } = useDialog()
  const [tab, setTab] = useState('waiting')
  const [posters, setPosters] = useState(false)
  const [busy, setBusy] = useState(false)
  const approve = b.pscan?.approve !== false

  const stock = useMemo(() => {
    const w = structuredClone(b)
    ensureProcessItems(w)
    return valuation(w).qty
  }, [b])

  const groups = {
    waiting: sc.rows.filter((r) => r.status === 'waiting'),
    applied: sc.rows.filter((r) => r.status === 'applied'),
    problem: sc.rows.filter((r) => r.status === 'problem'),
    rejected: sc.rows.filter((r) => r.status === 'rejected'),
    undone: sc.rows.filter((r) => r.status === 'undone'),
  }
  const shown = [...groups[tab]].reverse()
  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const effect = (row) => {
    if (!row.scan) return null
    const p = previewScan(b, row.scan)
    if (p.error) return <span className="ps-bad">{p.error}</span>
    return (
      <>
        {p.lines.map((l) => `${l.name} ${l.qty > 0 ? '+' : '−'}${qtyFmt(Math.abs(l.qty))}`).join(', ')}
        {p.bill && <span> · draft job-work bill {inr(p.bill.amount)}{p.bill.rate > 0 ? ` (₹${qtyFmt(p.bill.rate)} a piece)` : ''}</span>}
        {p.shortStock.length > 0 && <span className="ps-bad"> · not enough {p.shortStock.map((x) => x.name).join(', ')}</span>}
      </>
    )
  }

  return (
    <div className="work">
      <div className="main">
        <div className="card">
          <div className="ps-head">
            <div>
              <h3>Process scan</h3>
              <p className="muted">Stacking and moulding scans from the shop-floor phone app.</p>
            </div>
            <label className="ps-switch">
              <span>Approve scans first</span>
              <input type="checkbox" role="switch" checked={approve} onChange={(e) => updB((x) => (x.pscan = { ...(x.pscan || {}), approve: e.target.checked }))} />
              <b>{approve ? 'ON' : 'OFF'}</b>
            </label>
            <button className="btn ghost" onClick={() => setPosters(true)}>QR posters</button>
          </div>
          <p className="muted">Phone app: open <a href="./scan/" target="_blank" rel="noreferrer">this site's /scan/ page</a> on the shop-floor phone and add it to the home screen.</p>
          <p className="muted">
            {approve ? 'Scans wait here until you apply them.' : 'Scans are applied as soon as they arrive. This app must be open to apply them; otherwise they wait here.'}
          </p>
        </div>

        <Scanners bizId={b.id} />

        <div className="card">
          <h3>Stock by type</h3>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="r">At vendor</th>
                  <th className="r">Stacked</th>
                  <th className="r">Moulded</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map((t) => (
                  <tr key={t.id}>
                    <td className="nm">{t.name}</td>
                    <td className="r nw" data-l="At vendor">{qtyFmt(stock[itemId('av', t.id)])}</td>
                    <td className="r nw" data-l="Stacked">{qtyFmt(stock[itemId('stk', t.id)])}</td>
                    <td className="r nw" data-l="Moulded">{qtyFmt(stock[itemId('mld', t.id)])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Bill of materials per piece: set it in Inventory (BOM on each "In process" item). The starting amounts are placeholders.</p>
        </div>

        <div className="card">
          {!cloud.configured || !cloud.user ? (
            <Empty>Sign in to the cloud to receive scans. The phone app sends them through the same account.</Empty>
          ) : (
            <>
              <div className="ps-tabs chips" role="tablist" aria-label="Scan status">
                {[['waiting', 'Waiting'], ['applied', 'Applied'], ['problem', 'Problems'], ['rejected', 'Rejected'], ['undone', 'Undone']].map(([k, l]) => (
                  <button key={k} role="tab" className={tab === k ? 'on' : ''} aria-selected={tab === k} onClick={() => setTab(k)}>
                    {l} · {groups[k].length}
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                {tab === 'waiting' && groups.waiting.length > 1 && (
                  <button className="btn" disabled={busy} onClick={() => run(async () => { for (const r of groups.waiting) await sc.apply(r) })}>
                    Apply all {groups.waiting.length}
                  </button>
                )}
                <button className="btn ghost" disabled={busy} onClick={() => run(sc.refresh)}>Refresh</button>
              </div>
              {sc.error && <div className="err">{sc.error}</div>}
              {!shown.length ? (
                <Empty>{sc.ready ? 'Nothing here.' : 'Loading…'}</Empty>
              ) : (
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Process</th>
                        <th>What happened</th>
                        <th>Stock effect</th>
                        <th>Scanned</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.id}>
                          <td data-l="Process">{r.scan ? `${PROCESSES[r.scan.process]?.name || r.scan.process}${r.scan.action === 'issue' ? ' · issue' : r.scan.action === 'receive' ? ' · receive' : ''}` : '—'}</td>
                          <td data-l="What happened">
                            {describe(r.scan)}
                            {r.scan?.by || r.by ? <span className="muted"> · {r.scan?.by || r.by}</span> : null}
                          </td>
                          <td data-l="Stock effect" className="muted">{tab === 'applied' || tab === 'rejected' || tab === 'undone' ? r.note : tab === 'problem' ? <span className="ps-bad">{r.note}</span> : effect(r)}</td>
                          <td data-l="Scanned" className="nw">{when(r.scan?.at || r.at)}</td>
                          <td className="r nw">
                            {tab === 'applied' && (
                              <button className="btn ghost" disabled={busy} onClick={() => ask(`Undo this scan? Its stock changes${r.scan?.action === 'receive' ? ' and its draft job-work bill' : ''} will be taken back out.`, () => run(() => sc.undo(r)), 'Undo')}>Undo</button>
                            )}
                            {(tab === 'waiting' || tab === 'problem') && (
                              <>
                                <button className="btn ghost" disabled={busy} onClick={() => run(() => sc.reject(r))}>Reject</button>{' '}
                                <button className="btn" disabled={busy} onClick={() => run(() => sc.apply(r))}>{tab === 'problem' ? 'Retry' : 'Apply'}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {posters && <Posters b={b} onClose={() => setPosters(false)} />}
    </div>
  )
}
