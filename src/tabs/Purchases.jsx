import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../icons.jsx'
import { useStore } from '../lib/store.jsx'
import { acctOptions, find, purRows, purTot } from '../lib/calc.js'
import { nextNo } from '../lib/model.js'
import { inr, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field, LinesEditor, Modal, blankLine, cleanLines, useDialog, useMedia, Rolling, MoreRows, usePaged } from '../ui.jsx'
import { useToast } from '../toast.jsx'
import { NewParty, PdfNote, PdfUpload, usePdfAuto } from '../pdfui.jsx'
import { ensureParty, exclGst, importFile, markImported } from '../lib/pdfimport.js'
import DriveImport from '../driveui.jsx'
import { partyError } from '../lib/rules.js'

const blank = () => ({ sup: '', date: today(), pay: 'later', incl: 'excl', lines: [blankLine()] })

export default function Purchases() {
  const { b, updB, getS } = useStore()
  const getB = () => getS().biz.find((x) => x.id === getS().cur)
  const { ask, tell } = useDialog()
  const toast = useToast()
  const [src, setSrc] = useState(null) // Drive file the form was opened from
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [newSup, setNewSup] = useState(null)
  const [note, setNote] = useState(null)
  const [queue, setQueue] = useState({ rows: [], total: 0 }) // rows still to load after the current one
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('') // progress text while a scanned PDF is being read
  const [auto, setAuto] = usePdfAuto()
  const [showForm, setShowForm] = useState(false)
  const [q, setQ] = useState('')
  const [flt, setFlt] = useState('all')
  const [pick, setMode] = useState('table')
  const phone = useMedia('(max-width: 880px)')
  const mode = phone ? 'cards' : pick
  const [menu, setMenu] = useState(null)
  const [review, setReview] = useState([]) // PDFs read but not saved: { id, name, why, snap }
  const [rid, setRid] = useState(null)
  const sup = f.sup === '__new__' ? newSup : find(b.sup, f.sup)
  const opts = acctOptions(b, sup)
  const asLine = (r) => ({ item: r.item || '', qty: r.qty ?? '', rate: r.rate ?? '' })

  useEffect(() => {
    if (!menu) return undefined
    const close = (e) => !e.target.closest?.('.rowmenu') && setMenu(null)
    const hide = () => setMenu(null)
    document.addEventListener('click', close)
    window.addEventListener('wheel', hide, { passive: true }) // the menu is fixed to the screen, so it closes when the person scrolls instead of drifting off its row
    window.addEventListener('touchmove', hide, { passive: true })
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('wheel', hide)
      window.removeEventListener('touchmove', hide)
      window.removeEventListener('resize', hide)
    }
  }, [menu])

  const clearImport = () => {
    setShowForm(false)
    setRid(null)
    setSrc(null)
    setNewSup(null)
    setQueue({ rows: [], total: 0 })
    setNote(null)
  }

  const onPdf = async (file, opts = {}) => {
    setBusy(true)
    setNote(null)
    try {
      const useAuto = opts.auto ?? auto
      const r = await importFile(file, {
        mode: 'purchase',
        getB,
        updB,
        auto: useAuto,
        mark: opts.mark,
        onProgress: (p) => setStatus(`Reading scanned PDF, page ${p.page} of ${p.pages}${p.pct ? ' (' + Math.round(p.pct * 100) + '%)' : ''}…`),
      })
      if (r.status === 'saved') {
        setNote({ kind: 'ok', title: `Saved ${r.nos.join(', ')} as Pay later${r.isNew ? ' (new supplier added)' : ''}.`, lines: [] })
        toast.push(`${r.nos.length} purchase${r.nos.length === 1 ? '' : 's'} created from PDF`, 'ok')
        return
      }
      const { draft: d, issues } = r
      const [first, ...rest] = d.rows
      const nf = { sup: d.party, date: d.date || today(), pay: 'later', incl: 'excl', lines: [first ? asLine(first) : blankLine()] }
      setF(nf)
      setNewSup(d.newParty)
      setQueue({ rows: rest, total: d.rows.length })
      setSrc(opts.mark || null)
      const lines = useAuto ? [...issues] : []
      if (first && !first.item) lines.push(`"${first.desc || 'Item'}" did not match a raw material. Pick one on the row.`)
      if (d.rows.length > 1) lines.push(`${d.rows.length} item rows found. Item 1 of ${d.rows.length} is loaded; the next loads after you record it.`)
      lines.push('The rate is filled as excluding GST. Change "Rate includes" if the supplier rate includes GST.')
      const nn = { kind: 'warn', title: useAuto ? 'Not saved automatically.' : 'Form filled from the PDF. Check it, then click Record purchase.', lines }
      const id = uid()
      setNote(nn)
      setRid(id)
      setReview((l) => [...l.filter((x) => x.name !== (file.name || 'PDF')), { id, name: file.name || 'PDF', why: lines[0] || 'Check the details', snap: { f: nf, newSup: d.newParty, queue: { rows: rest, total: d.rows.length }, note: nn, src: opts.mark || null } }].slice(-5))
      setShowForm(true)
    } catch (e) {
      setNote({ kind: 'err', title: e.message, lines: [] })
      toast.push(e.message, 'err')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const submit = (e) => {
    e.preventDefault()
    const lines = cleanLines(f.lines)
    if (f.lines.some((l) => !l.item && +l.qty > 0)) return setErr('Choose a raw material for every row that has a quantity.')
    if (!sup || !lines.length) return setErr('Pick a supplier and add at least one line with a quantity.')
    if (f.sup === '__new__') {
      const bad = partyError(b, newSup)
      if (bad) return setErr(bad)
    }
    if (f.pay !== 'later' && !opts.some((o) => o.id === f.pay)) return setErr('That payment account is not allowed for this supplier type.')
    setErr('')
    const priced = f.incl === 'incl' ? lines.map((l) => ({ ...l, rate: exclGst(l.rate, sup.company) })) : lines
    let supId = f.sup
    updB((x) => {
      supId = ensureParty(x, 'sup', { party: f.sup, newParty: newSup })
      const id = uid()
      const p = { id, no: nextNo(x.pur, 'PUR-'), date: f.date, sup: supId, lines: priced }
      x.pur.push(p)
      if (src) markImported(x, src, 'purchase', p.no)
      if (f.pay !== 'later') x.tx.push({ id: uid(), date: f.date, kind: 'pay', party: supId, amt: purTot(x, p).total, acct: f.pay, ref: id })
    })
    setNewSup(null)
    setSrc(null)
    if (queue.rows.length) {
      const [next, ...rest] = queue.rows
      setF({ ...f, sup: supId, pay: 'later', lines: [asLine(next)] })
      setQueue({ rows: rest, total: queue.total })
      setNote({ kind: 'warn', title: `Recorded. Now item ${queue.total - rest.length} of ${queue.total}.`, lines: next.item ? [] : [`"${next.desc || 'Item'}" did not match a raw material. Pick one on the row.`] })
    } else {
      setF(blank())
      setNote(null)
      setShowForm(false)
    }
    setReview((l) => l.filter((x) => x.id !== rid))
    if (!queue.rows.length) setRid(null)
  }

  const del = (p) => {
    if (b.prr.some((r) => r.pur === p.id)) return tell('This purchase has a debit note. Remove the return first.')
    ask(
      `Delete ${p.no} and its linked payments?`,
      () =>
        updB((x) => {
          x.pur = x.pur.filter((y) => y.id !== p.id)
          x.tx = x.tx.filter((t) => t.ref !== p.id)
        }),
      'Delete',
    )
  }

  const all = useMemo(() => purRows(b), [b])
  const paidRows = all.filter((r) => r.isPaid)
  const dueRows = all.filter((r) => !r.isPaid)
  const billed = all.reduce((n, r) => n + r.t.total, 0)
  const settled = all.reduce((n, r) => n + (r.t.total - r.open), 0)
  const gstSum = all.reduce((n, r) => n + r.t.gst, 0)
  const needle = q.trim().toLowerCase()
  const rows = all.filter((r) => {
    if (flt === 'due' && r.isPaid) return false
    if (flt === 'paid' && !r.isPaid) return false
    if (flt === 'person' && !r.person) return false
    return !needle || (r.sp?.name || '').toLowerCase().includes(needle) || r.p.no.toLowerCase().includes(needle)
  })
  const pg = usePaged(rows, flt + '|' + needle)
  const openReview = (x) => {
    setF(x.snap.f)
    setNewSup(x.snap.newSup)
    setQueue(x.snap.queue)
    setNote(x.snap.note)
    setSrc(x.snap.src)
    setRid(x.id)
    setShowForm(true)
  }
  const Menu = ({ r }) => (
    <span className="rowmenu">
      <button type="button" className="iconbtn flat" aria-label={'Actions for ' + r.p.no} aria-expanded={menu?.id === r.p.id} onClick={(e) => {
        // The table wrapper scrolls sideways, which would clip a dropdown inside it (rows near the bottom could not be reached), so the menu is placed against the screen.
        const b = e.currentTarget.getBoundingClientRect()
        setMenu(menu?.id === r.p.id ? null : { id: r.p.id, right: Math.max(8, window.innerWidth - b.right), ...(b.bottom > window.innerHeight - 140 ? { bottom: window.innerHeight - b.top + 4 } : { top: b.bottom + 4 }) })
      }}>
        <Icon n="more" />
      </button>
      {menu?.id === r.p.id && (
        <span className="menu" role="menu" style={{ right: menu.right, top: menu.top, bottom: menu.bottom }}>
          <button type="button" role="menuitem" className="bad" onClick={() => (setMenu(null), del(r.p))}>Delete</button>
        </span>
      )}
    </span>
  )
  const chip = (id, label, n) => (
    <button key={id} className={flt === id ? 'on' : ''} onClick={() => setFlt(id)}>
      {label} <span>{n}</span>
    </button>
  )
  const badge = (r) => (r.isPaid ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>)

  return (
    <>
      <div className="phead">
        <div>
          <h2 className="ptitle"><span className="hico"><Icon n="pur" /></span>Purchases</h2>
          <p className="muted">Raw material you buy — firms add GST, persons do not</p>
        </div>
        <div className="r">
          <input className="search" type="search" placeholder="Search purchases" aria-label="Search purchases" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg hidephone" role="group" aria-label="View">
            <button className={pick === 'table' ? 'on' : ''} onClick={() => setMode('table')}>☰ Table</button>
            <button className={pick === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>▦ Cards</button>
          </div>
          <button className="btn" onClick={() => setShowForm(true)}>+ New purchase</button>
        </div>
      </div>

      <div className="stats s4">
        <div className="stat">
          <div className="l"><i className="dot" />Purchases</div>
          <div className="v"><Rolling n={all.length} count /></div>
          <div className="s">{all.length ? 'Recorded in this business' : 'None yet'}</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-good" />Paid</div>
          <div className="v"><Rolling n={paidRows.reduce((n, r) => n + r.t.total, 0)} /></div>
          <div className="s">{paidRows.length} purchase{paidRows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-warn" />To pay</div>
          <div className="v"><Rolling n={dueRows.reduce((n, r) => n + r.open, 0)} /></div>
          <div className="s">{dueRows.length} purchase{dueRows.length === 1 ? '' : 's'} outstanding</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-dark" />GST input</div>
          <div className="v"><Rolling n={gstSum} /></div>
          <div className="s">Credit on purchases</div>
        </div>
      </div>

      <div className="work">
        <div className="main">
          <div className="card">
            <div className="ch">
              <span className="ico"><Icon n="pur" /></span>All purchases
              <div className="chips inl">
                {chip('all', 'All', all.length)}
                {chip('due', 'Due', dueRows.length)}
                {chip('paid', 'Paid', paidRows.length)}
                {chip('person', 'Persons', all.filter((r) => r.person).length)}
              </div>
            </div>
            {rows.length === 0 ? (
              <Empty>{all.length ? 'No purchases match.' : 'No purchases yet.'}</Empty>
            ) : mode === 'table' ? (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>No</th>
                      <th>Date</th>
                      <th className="r">Taxable</th>
                      <th className="r">GST</th>
                      <th className="r">Total</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pg.shown.map((r) => (
                      <tr key={r.p.id}>
                        <td>
                          <b>{r.sp?.name}</b>
                          <div className="sub">{r.sp?.gstin || (r.person ? 'Person' : 'Firm')}</div>
                        </td>
                        <td className="nw">{r.p.no}</td>
                        <td className="nw">{dmy(r.p.date)}</td>
                        <td className="r nw">{inr(r.t.taxable)}</td>
                        <td className="r nw">{inr(r.t.gst)}</td>
                        <td className="r nw"><b>{inr(r.t.total)}</b></td>
                        <td>{badge(r)}</td>
                        <td className="r">{Menu({ r })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="icards">
                {pg.shown.map((r) => (
                  <div className="icard" key={r.p.id}>
                    <div className="ictop">
                      <b>{r.p.no}</b>
                      {badge(r)}
                    </div>
                    <div className="who">{r.sp?.name}</div>
                    <div className="sub">{r.sp?.gstin || (r.person ? 'Person' : 'Firm')} · {dmy(r.p.date)}</div>
                    <div className="amt">{inr(r.t.total)}</div>
                    <div className="foot">
                      <span>GST {inr(r.t.gst)}</span>
                      {Menu({ r })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <MoreRows pg={pg} />
          </div>
        </div>

        <div className="side">
          <div className="card importer">
            <div className="ch"><span className="ico"><Icon n="up" /></span>Import from PDF</div>
            <p className="muted">Drop a supplier invoice PDF — scans are read with OCR and checked before saving.</p>
            <PdfUpload auto={auto} setAuto={setAuto} busy={busy} status={status} label="Choose PDF" onFile={(file) => onPdf(file)} />
            <DriveImport mode="purchase" auto={auto} busy={busy} onOpen={(file, mark) => onPdf(file, { auto: false, mark })} />
            {!showForm && <PdfNote note={note} onDismiss={() => (clearImport(), setF(blank()))} />}
          </div>

          {review.length > 0 && (
            <div className="card">
              <div className="ch"><span className="ico warn"><Icon n="warn" /></span>Needs review</div>
              <div className="revs">
                {review.map((x) => (
                  <div className="rev" key={x.id}>
                    <div>
                      <b>{x.name}</b>
                      <div className="sub">{x.why}</div>
                    </div>
                    <button className="btn ghost" onClick={() => openReview(x)}>Open</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card d-prod coll">
            <div className="ch">Payments made</div>
            <div className="big">{inr(settled)}</div>
            <div className="meter"><i style={{ width: Math.max(2, billed > 0 ? (settled / billed) * 100 : 0) + '%' }} /></div>
            <div className="s">{billed > 0 ? Math.round((settled / billed) * 100) : 0}% of {inr(billed)} bought</div>
          </div>
        </div>
      </div>

      {showForm && (
        <Modal title="New purchase" onClose={() => setShowForm(false)} wide>
          <form onSubmit={submit}>
            <PdfNote note={note} onDismiss={() => (clearImport(), setF(blank()))} />
            {newSup && <NewParty title="New supplier" p={newSup} setP={setNewSup} forceFirm={b.kind === 'firm'} />}
            <div className="grid">
              <Field label="Supplier">
                <select value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value, pay: 'later' })}>
                  <option value="">Select…</option>
                  {newSup && <option value="__new__">New supplier: {newSup.name}</option>}
                  {b.sup.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.company ? '(firm · GST)' : '(person)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </Field>
              <Field label="Rate includes">
                <select value={f.incl} onChange={(e) => setF({ ...f, incl: e.target.value })}>
                  <option value="excl">Excluding GST</option>
                  <option value="incl">Including GST (18%)</option>
                </select>
              </Field>
              <Field label="Payment">
                <select value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })}>
                  <option value="later">Pay later</option>
                  {opts.map((o) => (
                    <option key={o.id} value={o.id}>
                      Paid now — {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <LinesEditor items={b.items.filter((i) => i.type === 'raw')} lines={f.lines} setLines={(lines) => setF({ ...f, lines })} />
            <p className="muted">{f.incl === 'incl' ? 'Rates include 18% GST for firms; the app removes it before recording.' : 'Rates are before GST. Firms add 18% GST automatically.'}</p>
            <ErrBar msg={err} />
            <button className="btn">Record purchase</button>
          </form>
        </Modal>
      )}
    </>
  )
}
