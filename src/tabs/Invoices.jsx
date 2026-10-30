import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../icons.jsx'
import { useStore } from '../lib/store.jsx'
import { find, invTot, saleRows, valuation } from '../lib/calc.js'
import { nextNo } from '../lib/model.js'
import { inr, qtyFmt, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field, LinesEditor, Modal, blankLine, cleanLines, useDialog, useMedia, Rolling, MoreRows, usePaged, useTableFilter, FilterBar } from '../ui.jsx'
import { useToast } from '../toast.jsx'
import { NewParty, PdfNote, PdfUpload, usePdfAuto } from '../pdfui.jsx'
import { addInvoice, importFile, markImported } from '../lib/pdfimport.js'
import DriveImport from '../driveui.jsx'
import { partyError } from '../lib/rules.js'
import { supplyType } from '../lib/calc.js'

function Paper({ b, inv }) {
  const c = find(b.cust, inv.cust)
  const t = invTot(b, inv)
  const firm = !!c?.company
  return (
    <div className="paper">
      <div className="ph">
        <div>
          <h2>{b.name}</h2>
          <div className="muted">{firm ? 'TAX INVOICE' : 'BILL OF SUPPLY'}</div>
        </div>
        <div className="r">
          <b>{inv.no}</b>
          <div>{dmy(inv.date)}</div>
          {inv.lr && <div>LR No: {inv.lr}</div>}
          {inv.transporter && <div>Transport: {inv.transporter}</div>}
        </div>
      </div>
      <div className="pb">
        <b>Bill to:</b> {c?.name}
        {firm && <div>GSTIN: {c.gstin}</div>}
        {firm && <div>Place of supply: {t.type === 'inter' ? 'Interstate (IGST)' : 'Within state (CGST + SGST)'}</div>}
      </div>
      <div className="tw">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>HSN</th>
            <th className="r">Qty</th>
            <th className="r">Rate</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => {
            const it = find(b.items, l.item)
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it?.name}</td>
                <td>{it?.hsn}</td>
                <td className="r">
                  {qtyFmt(l.qty)} {it?.unit}
                </td>
                <td className="r">{inr(l.rate)}</td>
                <td className="r">{inr(l.qty * l.rate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <div className="tots">
        <div>
          <span>Taxable value</span>
          <span>{inr(t.taxable)}</span>
        </div>
        {t.type === 'intra' && (
          <>
            <div>
              <span>CGST 9%</span>
              <span>{inr(t.cgst)}</span>
            </div>
            <div>
              <span>SGST 9%</span>
              <span>{inr(t.sgst)}</span>
            </div>
          </>
        )}
        {t.type === 'inter' && (
          <div>
            <span>IGST 18%</span>
            <span>{inr(t.igst)}</span>
          </div>
        )}
        <div className="grand">
          <span>Total</span>
          <span>{inr(t.total)}</span>
        </div>
      </div>
    </div>
  )
}

const blankForm = () => ({ cust: '', date: today(), lr: '', transporter: '', lines: [blankLine()] })

export default function Invoices({ newInv = 0 }) {
  const { b, updB, getS } = useStore()
  const getB = () => getS().biz.find((x) => x.id === getS().cur)
  const { ask, tell } = useDialog()
  const toast = useToast()
  const [src, setSrc] = useState(null) // Drive file the form was opened from
  const [f, setF] = useState(blankForm)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  const [newCust, setNewCust] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('') // progress text while a scanned PDF is being read
  const [auto, setAuto] = usePdfAuto()
  const [showForm, setShowForm] = useState(newInv > 0) // already open on the first paint when "+" brought us here
  useEffect(() => {
    if (newInv) setShowForm(true)
  }, [newInv])
  const [q, setQ] = useState('')
  const [flt, setFlt] = useState('all')
  const df = useTableFilter() // date range
  const [pick, setMode] = useState('table')
  const phone = useMedia('(max-width: 1180px)')
  const mode = phone ? 'cards' : pick
  const [menu, setMenu] = useState(null)
  const [review, setReview] = useState([]) // PDFs read but not saved: { id, name, why, snap }
  const [rid, setRid] = useState(null)
  const v = useMemo(() => valuation(b), [b])

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

  const reset = () => {
    setShowForm(false)
    setRid(null)
    setF(blankForm())
    setNewCust(null)
    setSrc(null)
  }

  const onPdf = async (file, opts = {}) => {
    setBusy(true)
    setNote(null)
    try {
      const useAuto = opts.auto ?? auto
      const r = await importFile(file, {
        mode: 'sale',
        getB,
        updB,
        auto: useAuto,
        mark: opts.mark,
        onProgress: (p) => setStatus(`Reading scanned PDF, page ${p.page} of ${p.pages}${p.pct ? ' (' + Math.round(p.pct * 100) + '%)' : ''}…`),
      })
      if (r.status === 'saved') {
        setNote({ kind: 'ok', title: `Saved ${r.nos[0]} for ${r.who}${r.isNew ? ' (new customer added)' : ''}.`, lines: [] })
        toast.push(`Invoice ${r.nos[0]} created from PDF`, 'ok')
        return
      }
      const { draft: d, issues } = r
      const lines2 = []
      if (d.supply) {
        const c = d.party === '__new__' ? d.newParty : find(b.cust, d.party)
        if (c?.gstin && c.company) {
          const mine = supplyType(b, c)
          if ((d.supply === 'inter') !== (mine === 'inter')) lines2.push(`The PDF shows ${d.supply === 'inter' ? 'IGST' : 'CGST + SGST'} but the GSTIN state code gives ${mine === 'inter' ? 'IGST' : 'CGST + SGST'}. The app uses the GSTIN.`)
        }
      }
      d.rows.forEach((r, i) => !r.item && lines2.push(`Row ${i + 1} ("${r.desc || 'no description'}", qty ${r.qty ?? '?'}, rate ${r.rate ?? '?'}) did not match a product. Choose one on that row.`))
      const nf = {
        cust: d.party,
        date: d.date || today(),
        lr: d.lr,
        transporter: d.transporter,
        lines: d.rows.length ? d.rows.map((r) => ({ item: r.item, qty: r.qty ?? '', rate: r.rate ?? '' })) : [blankLine()],
      }
      const nn = {
        kind: 'warn',
        title: useAuto ? 'Not saved automatically.' : 'Form filled from the PDF. Check it, then click Create.',
        lines: useAuto ? [...issues, ...lines2] : lines2,
      }
      const id = uid()
      setF(nf)
      setNewCust(d.newParty)
      setSrc(opts.mark || null)
      setNote(nn)
      setRid(id)
      setReview((l) => [...l.filter((x) => x.name !== (file.name || 'PDF')), { id, name: file.name || 'PDF', why: nn.lines[0] || 'Check the details', snap: { f: nf, newCust: d.newParty, note: nn, src: opts.mark || null } }].slice(-5))
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
    if (f.lines.some((l) => !l.item && +l.qty > 0)) return setErr('Choose a product for every row that has a quantity.')
    if (!f.cust || !lines.length) return setErr('Pick a customer and add at least one line with a quantity.')
    if (f.cust === '__new__') {
      const bad = partyError(b, newCust)
      if (bad) return setErr(bad)
    }
    const create = () => {
      setErr('')
      updB((x) => {
        const inv = addInvoice(x, { party: f.cust, newParty: newCust, date: f.date, lr: f.lr, transporter: f.transporter, lines })
        if (src) markImported(x, src, 'sale', inv.no)
      })
      setReview((l) => l.filter((x) => x.id !== rid))
      reset()
      setNote(null)
    }
    const short = lines.find((l) => l.qty > (v.qty[l.item] || 0))
    if (short) ask(`Only ${qtyFmt(v.qty[short.item] || 0)} of ${find(b.items, short.item)?.name} in stock. Create the invoice anyway?`, create, 'Create anyway')
    else create()
  }

  const del = (i) => {
    if (b.sr.some((s) => s.inv === i.id) || b.tx.some((t) => t.ref === i.id)) return tell('This invoice has returns or payments linked to it. Remove those first.')
    ask(`Delete ${i.no}?`, () => updB((x) => (x.inv = x.inv.filter((y) => y.id !== i.id))), 'Delete')
  }

  const all = useMemo(() => saleRows(b), [b])
  const paidRows = all.filter((r) => r.isPaid)
  const dueRows = all.filter((r) => !r.isPaid)
  const billed = all.reduce((n, r) => n + r.t.total, 0)
  const got = all.reduce((n, r) => n + Math.min(r.t.total, r.t.total - r.open), 0)
  const gstSum = all.reduce((n, r) => n + r.t.gst, 0)
  const needle = q.trim().toLowerCase()
  const rows = all.filter((r) => {
    if (flt === 'due' && r.isPaid) return false
    if (flt === 'paid' && !r.isPaid) return false
    if (flt === 'person' && !r.person) return false
    if (!df.test(r.i.date, '')) return false
    return !needle || (r.c?.name || '').toLowerCase().includes(needle) || r.i.no.toLowerCase().includes(needle)
  })
  const pg = usePaged(rows, flt + '|' + needle + '|' + df.key)
  const open = (r) => setView(r.i)
  const openReview = (x) => {
    setF(x.snap.f)
    setNewCust(x.snap.newCust)
    setNote(x.snap.note)
    setSrc(x.snap.src)
    setRid(x.id)
    setShowForm(true)
  }
  const Menu = ({ r }) => (
    <span className="rowmenu">
      <button type="button" className="iconbtn flat" aria-label={'Actions for ' + r.i.no} aria-expanded={menu?.id === r.i.id} onClick={(e) => {
        // The table wrapper scrolls sideways, which would clip a dropdown inside it (rows near the bottom could not be reached), so the menu is placed against the screen.
        const b = e.currentTarget.getBoundingClientRect()
        setMenu(menu?.id === r.i.id ? null : { id: r.i.id, right: Math.max(8, window.innerWidth - b.right), ...(b.bottom > window.innerHeight - 140 ? { bottom: window.innerHeight - b.top + 4 } : { top: b.bottom + 4 }) })
      }}>
        <Icon n="more" />
      </button>
      {menu?.id === r.i.id && (
        <span className="menu" role="menu" style={{ right: menu.right, top: menu.top, bottom: menu.bottom }}>
          <button type="button" role="menuitem" onClick={() => (setMenu(null), open(r))}>View</button>
          <button type="button" role="menuitem" className="bad" onClick={() => (setMenu(null), del(r.i))}>Delete</button>
        </span>
      )}
    </span>
  )
  const chip = (id, label, n) => (
    <button key={id} className={flt === id ? 'on' : ''} onClick={() => setFlt(id)}>
      {label} <span>{n}</span>
    </button>
  )

  return (
    <>
      <div className="phead">
        <div>
          <h2 className="ptitle"><span className="hico"><Icon n="inv" /></span>Invoices &amp; bills</h2>
          <p className="muted">Everything you sell — firms get INV, persons get BILL</p>
        </div>
        <div className="r">
          <div className="seg hidephone" role="group" aria-label="View">
            <button className={pick === 'table' ? 'on' : ''} onClick={() => setMode('table')}>☰ Table</button>
            <button className={pick === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>▦ Cards</button>
          </div>
          <button className="btn" onClick={() => setShowForm(true)}>+ New invoice</button>
        </div>
      </div>

      <div className="stats s4">
        <div className="stat">
          <div className="l"><i className="dot" />Invoices</div>
          <div className="v"><Rolling n={all.length} count /></div>
          <div className="s">{b.inv.length ? 'Recorded in this business' : 'None yet'}</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-good" />Paid</div>
          <div className="v"><Rolling n={paidRows.reduce((n, r) => n + r.t.total, 0)} /></div>
          <div className="s">{paidRows.length} invoice{paidRows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-warn" />Due</div>
          <div className="v"><Rolling n={dueRows.reduce((n, r) => n + r.open, 0)} /></div>
          <div className="s">{dueRows.length} invoice{dueRows.length === 1 ? '' : 's'} outstanding</div>
        </div>
        <div className="stat">
          <div className="l"><i className="dot dot-dark" />GST collected</div>
          <div className="v"><Rolling n={gstSum} /></div>
          <div className="s">CGST+SGST · IGST</div>
        </div>
      </div>

      <div className="work">
        <div className="main">
          <div className="card">
            <div className="ch">
              <span className="ico"><Icon n="inv" /></span>All invoices
              <div className="chips inl">
                {chip('all', 'All', all.length)}
                {chip('due', 'Due', dueRows.length)}
                {chip('paid', 'Paid', paidRows.length)}
                {chip('person', 'Persons', all.filter((r) => r.person).length)}
              </div>
            </div>
            <FilterBar f={df} label="invoices" q={q} setQ={setQ} shown={rows.length} total={all.length} active={!!needle} />
            {rows.length === 0 ? (
              <Empty>{all.length ? 'No invoices match.' : 'No invoices yet.'}</Empty>
            ) : mode === 'table' ? (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>No</th>
                      <th>Date</th>
                      <th className="r c-tax">Taxable</th>
                      <th className="r c-gst">GST</th>
                      <th className="r">Total</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pg.shown.map((r) => (
                      <tr key={r.i.id}>
                        <td>
                          <b>{r.c?.name}</b>
                          <div className="sub">{r.c?.gstin || (r.person ? 'Person · cash' : 'Firm')}</div>
                        </td>
                        <td className="nw">{r.i.no}</td>
                        <td className="nw">{dmy(r.i.date)}</td>
                        <td className="r nw c-tax">{inr(r.t.taxable)}</td>
                        <td className="r nw c-gst">{inr(r.t.gst)}</td>
                        <td className="r nw"><b>{inr(r.t.total)}</b></td>
                        <td>{r.isPaid ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>}</td>
                        <td className="r">{Menu({ r })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="icards">
                {pg.shown.map((r) => (
                  <div className="icard" key={r.i.id}>
                    <div className="ictop">
                      <b>{r.i.no}</b>
                      {r.isPaid ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>}
                    </div>
                    <div className="who">{r.c?.name}</div>
                    <div className="sub">{r.c?.gstin || (r.person ? 'Person · cash' : 'Firm')} · {dmy(r.i.date)}</div>
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
            <p className="muted">Drop a sale invoice PDF — scans are read with OCR and checked before saving.</p>
            <PdfUpload auto={auto} setAuto={setAuto} busy={busy} status={status} label="Choose PDF" onFile={(file) => onPdf(file)} />
            <DriveImport mode="sale" auto={auto} busy={busy} onOpen={(file, mark) => onPdf(file, { auto: false, mark })} />
            {!showForm && <PdfNote note={note} onDismiss={() => (setNote(null), reset())} />}
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
            <div className="ch">Collections</div>
            <div className="big">{inr(got)}</div>
            <div className="meter"><i style={{ width: Math.max(2, billed > 0 ? (got / billed) * 100 : 0) + '%' }} /></div>
            <div className="s">{billed > 0 ? Math.round((got / billed) * 100) : 0}% of {inr(billed)} billed</div>
          </div>
        </div>
      </div>

      {showForm && (
        <Modal title="New invoice / bill" onClose={() => setShowForm(false)} wide>
          <form onSubmit={submit}>
            <PdfNote note={note} onDismiss={() => (setNote(null), reset())} />
            {newCust && <NewParty title="New customer" p={newCust} setP={setNewCust} forceFirm={b.kind === 'firm'} />}
            <div className="grid">
              <Field label="Customer">
                <select value={f.cust} onChange={(e) => setF({ ...f, cust: e.target.value })}>
                  <option value="">Select…</option>
                  {newCust && <option value="__new__">New customer: {newCust.name}</option>}
                  {b.cust.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? '(firm · INV, GST)' : '(person · BILL)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </Field>
              <Field label="LR number (transport)">
                <input value={f.lr} onChange={(e) => setF({ ...f, lr: e.target.value })} />
              </Field>
              <Field label="Transporter">
                <input value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} />
              </Field>
            </div>
            <LinesEditor items={b.items} lines={f.lines} setLines={(lines) => setF({ ...f, lines })} rateFrom={(it) => it.rate} />
            <ErrBar msg={err} />
            {b.cust.length === 0 && <p className="muted">Add a customer under Parties first.</p>}
            <button className="btn">Create</button>
          </form>
        </Modal>
      )}

      {view && (
        <Modal title={view.no} onClose={() => setView(null)} wide>
          <Paper b={b} inv={view} />
        </Modal>
      )}
    </>
  )
}
