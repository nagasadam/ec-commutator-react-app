import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { find, invTot, srTot, paidFor, valuation } from '../lib/calc.js'
import { nextNo } from '../lib/model.js'
import { inr, qtyFmt, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field, LinesEditor, Modal, blankLine, cleanLines, useDialog } from '../ui.jsx'
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

export default function Invoices() {
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
  const [auto, setAuto] = usePdfAuto()
  const v = useMemo(() => valuation(b), [b])

  const reset = () => {
    setF(blankForm())
    setNewCust(null)
    setSrc(null)
  }

  const onPdf = async (file, opts = {}) => {
    setBusy(true)
    setNote(null)
    try {
      const useAuto = opts.auto ?? auto
      const r = await importFile(file, { mode: 'sale', getB, updB, auto: useAuto, mark: opts.mark })
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
      setF({
        cust: d.party,
        date: d.date || today(),
        lr: d.lr,
        transporter: d.transporter,
        lines: d.rows.length ? d.rows.map((r) => ({ item: r.item, qty: r.qty ?? '', rate: r.rate ?? '' })) : [blankLine()],
      })
      setNewCust(d.newParty)
      setSrc(opts.mark || null)
      setNote({
        kind: 'warn',
        title: useAuto ? 'Not saved automatically.' : 'Form filled from the PDF. Check it, then click Create.',
        lines: useAuto ? [...issues, ...lines2] : lines2,
      })
    } catch (e) {
      setNote({ kind: 'err', title: e.message, lines: [] })
      toast.push(e.message, 'err')
    } finally {
      setBusy(false)
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

  const rows = [...b.inv].reverse()
  return (
    <>
      <form className="card" onSubmit={submit}>
        <h3>New invoice / bill</h3>
        <PdfUpload auto={auto} setAuto={setAuto} busy={busy} onFile={(file) => onPdf(file)} />
        <DriveImport mode="sale" auto={auto} busy={busy} onOpen={(file, mark) => onPdf(file, { auto: false, mark })} />
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
        {b.cust.length === 0 && <p className="muted">Add a customer under Customers &amp; suppliers first.</p>}
        <button className="btn">Create</button>
      </form>

      <div className="card">
        <h3>Invoices &amp; bills</h3>
        {rows.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="r">Taxable</th>
                  <th className="r">GST</th>
                  <th className="r">Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const t = invTot(b, i)
                  const cn = b.sr.filter((s) => s.inv === i.id).reduce((s, r) => s + srTot(b, r).total, 0)
                  const open = t.total - cn - paidFor(b, i.id)
                  return (
                    <tr key={i.id}>
                      <td>{i.no}</td>
                      <td>{dmy(i.date)}</td>
                      <td>{find(b.cust, i.cust)?.name}</td>
                      <td className="r">{inr(t.taxable)}</td>
                      <td className="r">{inr(t.gst)}</td>
                      <td className="r">{inr(t.total)}</td>
                      <td>{open < 0.5 ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>}</td>
                      <td className="r nw">
                        <button className="btn ghost" onClick={() => setView(i)}>
                          View
                        </button>
                        <button className="btn ghost" onClick={() => del(i)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {view && (
        <Modal title={view.no} onClose={() => setView(null)} wide>
          <Paper b={b} inv={view} />
        </Modal>
      )}
    </>
  )
}
