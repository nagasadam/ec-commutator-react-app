import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { acctOptions, find, paidFor, prrTot, purTot } from '../lib/calc.js'
import { nextNo } from '../lib/model.js'
import { inr, today, uid, dmy } from '../lib/format.js'
import { Empty, ErrBar, Field, LinesEditor, blankLine, cleanLines, useDialog } from '../ui.jsx'
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
  const [auto, setAuto] = usePdfAuto()
  const sup = f.sup === '__new__' ? newSup : find(b.sup, f.sup)
  const opts = acctOptions(b, sup)
  const asLine = (r) => ({ item: r.item || '', qty: r.qty ?? '', rate: r.rate ?? '' })

  const clearImport = () => {
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
      const r = await importFile(file, { mode: 'purchase', getB, updB, auto: useAuto, mark: opts.mark })
      if (r.status === 'saved') {
        setNote({ kind: 'ok', title: `Saved ${r.nos.join(', ')} as Pay later${r.isNew ? ' (new supplier added)' : ''}.`, lines: [] })
        toast.push(`${r.nos.length} purchase${r.nos.length === 1 ? '' : 's'} created from PDF`, 'ok')
        return
      }
      const { draft: d, issues } = r
      const [first, ...rest] = d.rows
      setF({ sup: d.party, date: d.date || today(), pay: 'later', incl: 'excl', lines: [first ? asLine(first) : blankLine()] })
      setNewSup(d.newParty)
      setQueue({ rows: rest, total: d.rows.length })
      setSrc(opts.mark || null)
      const lines = useAuto ? [...issues] : []
      if (first && !first.item) lines.push(`"${first.desc || 'Item'}" did not match a raw material. Pick one on the row.`)
      if (d.rows.length > 1) lines.push(`${d.rows.length} item rows found. Item 1 of ${d.rows.length} is loaded; the next loads after you record it.`)
      lines.push('The rate is filled as excluding GST. Change "Rate includes" if the supplier rate includes GST.')
      setNote({ kind: 'warn', title: useAuto ? 'Not saved automatically.' : 'Form filled from the PDF. Check it, then click Record purchase.', lines })
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
    }
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

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h3>New purchase</h3>
        <PdfUpload auto={auto} setAuto={setAuto} busy={busy} onFile={(file) => onPdf(file)} />
        <DriveImport mode="purchase" auto={auto} busy={busy} onOpen={(file, mark) => onPdf(file, { auto: false, mark })} />
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

      <div className="card">
        <h3>Purchases</h3>
        {b.pur.length === 0 ? (
          <Empty>No purchases yet.</Empty>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="r">Taxable</th>
                  <th className="r">GST</th>
                  <th className="r">Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...b.pur].reverse().map((p) => {
                  const t = purTot(b, p)
                  const dn = b.prr.filter((r) => r.pur === p.id).reduce((s, r) => s + prrTot(b, r).total, 0)
                  const open = t.total - dn - paidFor(b, p.id)
                  return (
                    <tr key={p.id}>
                      <td>{p.no}</td>
                      <td>{dmy(p.date)}</td>
                      <td>{find(b.sup, p.sup)?.name}</td>
                      <td className="r">{inr(t.taxable)}</td>
                      <td className="r">{inr(t.gst)}</td>
                      <td className="r">{inr(t.total)}</td>
                      <td>{open < 0.5 ? <span className="pill ok">Paid</span> : <span className="pill warn">Due</span>}</td>
                      <td className="r">
                        <button className="btn ghost" onClick={() => del(p)}>
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
    </>
  )
}
