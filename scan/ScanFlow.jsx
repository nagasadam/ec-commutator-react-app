import { useCallback, useState } from 'react'
import { TYPES, PROCESSES, parseQr, parsePair, bizTag, scanProblem, nextLot, typeName } from '../src/lib/process.js'
import { Camera, Stepper } from './widgets.jsx'
import { n, today, uid } from './storage.js'

export default function ScanFlow({ app }) {
  const { st, user, add, pair } = app
  const [process, setProcess] = useState(null)
  const [action, setAction] = useState('')
  const [type, setType] = useState('')
  const [f, setF] = useState({ qty: '', rejects: '', bushRejects: '', charge: '', sup: '', lot: '', note: '' })
  const [step, setStep] = useState('aim') // aim | type | form | confirm | done
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(null)

  const reset = () => {
    setProcess(null); setAction(''); setType(''); setF({ qty: '', rejects: '', bushRejects: '', charge: '', sup: '', lot: '', note: '' }); setStep('aim'); setErr(''); setCode('')
  }
  const onText = useCallback(
    (t) => {
      const p = parsePair(t)
      if (p) {
        pair(p)
        return setErr('')
      }
      const q = parseQr(t)
      if (!q) return setErr('That is not one of this factory’s process QR codes.')
      if (!st.biz) return setErr('Link this phone first: scan the pairing QR from the main app (Process scan → QR posters).')
      if (q.tag !== bizTag(st.biz)) return setErr('That QR belongs to a different business.')
      if (navigator.vibrate) navigator.vibrate(60)
      setErr('')
      setProcess(q.process)
      setAction(q.process === 'moulding' ? 'run' : '')
      setStep('type')
    },
    [st.biz, pair],
  )

  const meta = st.meta
  const queuedLots = st.queue.filter((s) => s.action === 'issue').map((s) => s.lot)
  const receivedQueued = new Set(st.queue.filter((s) => s.action === 'receive').map((s) => s.lot))
  const openLots = (meta?.lots || []).concat(st.queue.filter((s) => s.action === 'issue').map((s) => ({ lot: s.lot, type: s.type, sup: s.sup, expected: s.qty }))).filter((l) => !receivedQueued.has(l.lot))
  const lotsForType = openLots.filter((l) => l.type === type)
  const chosen = openLots.find((l) => l.lot === f.lot)
  const rate = Number(meta?.rates?.[type]) || 0 // job-work rate per piece, from the office app

  const pickType = (t) => {
    setType(t)
    setF((x) => ({ ...x, lot: '', qty: '', rejects: '', bushRejects: '', charge: '' }))
    if (process === 'stacking' && action === 'issue') setF((x) => ({ ...x, lot: nextLot([...(meta?.lots || []).map((l) => l.lot), ...queuedLots]) }))
    setStep('form')
  }
  const scan = () => ({
    id: uid(), process, action, type, date: today(), by: user?.email || '', at: new Date().toISOString(),
    qty: Number(f.qty), rejects: f.rejects === '' ? 0 : Number(f.rejects), bushRejects: f.bushRejects === '' ? 0 : Number(f.bushRejects), lot: f.lot || undefined, sup: action === 'issue' ? f.sup : chosen?.sup || '', charge: action === 'receive' && f.charge !== '' ? Number(f.charge) : undefined, note: f.note.trim() || undefined,
  })
  const review = () => {
    const s = scan()
    const bad = scanProblem(s)
    if (bad) return setErr(bad)
    if (action === 'issue' && !f.sup) return setErr('Choose the vendor.')
    setErr('')
    setStep('confirm')
  }
  const submit = async () => {
    const s = scan()
    setSent(await add(s))
    setStep('done')
  }

  if (step === 'aim')
    return (
      <div className="screen">
        <h2>Scan a process QR</h2>
        <Camera onText={onText} />
        {err && <div className="err" role="alert">{err}</div>}
        <div className="card">
          <label className="small">Camera not working? Type the code under the QR</label>
          <div className="row">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V4|STACKING|ab12" aria-label="Process code under the QR" autoCapitalize="characters" />
            <button className="btn" onClick={() => onText(code)}>Go</button>
          </div>
        </div>
      </div>
    )

  if (step === 'type')
    return (
      <div className="screen">
        <h2>{PROCESSES[process].name}</h2>
        {process === 'stacking' && (
          <>
            <p className="muted">What are you doing?</p>
            <div className="seg" role="group" aria-label="What are you doing?">
              {[['issue', 'Issue to vendor'], ['receive', 'Receive back']].map(([k, l]) => (
                <button key={k} className={action === k ? 'on' : ''} aria-pressed={action === k} onClick={() => setAction(k)}>{l}</button>
              ))}
            </div>
          </>
        )}
        {action && (
          <>
            <p className="muted">Which type?</p>
            <div className="types">
              {TYPES.map((t) => (
                <button key={t.id} className="type" onClick={() => pickType(t.id)}>
                  <b>{t.name}</b>
                  {meta?.stock && <span>{n(meta.stock[(action === 'run' ? 'stk_' : action === 'receive' ? 'av_' : 'stk_') + t.id])} {action === 'run' ? 'stacked' : action === 'receive' ? 'at vendor' : 'stacked'}</span>}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="btn ghost" onClick={reset}>Cancel</button>
      </div>
    )

  if (step === 'form')
    return (
      <div className="screen">
        <h2>{PROCESSES[process].name} · {typeName(type)}</h2>
        {action === 'issue' && (
          <>
            <div className="field">
              <label>Vendor</label>
              <select aria-label="Vendor" value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}>
                <option value="">Choose…</option>
                {(meta?.vendors || []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>Lot number</label><input aria-label="Lot number" value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value.toUpperCase() })} /></div>
            <Stepper label="Pieces expected back" value={f.qty} set={(v) => setF({ ...f, qty: v })} step={100} big />
          </>
        )}
        {action === 'receive' && (
          <>
            <div className="field">
              <label>Lot coming back</label>
              {lotsForType.length ? (
                <select aria-label="Lot coming back" value={f.lot} onChange={(e) => { const l = openLots.find((x) => x.lot === e.target.value); setF({ ...f, lot: e.target.value, qty: l ? String(l.expected) : '' }) }}>
                  <option value="">Choose…</option>
                  {lotsForType.map((l) => (
                    <option key={l.lot} value={l.lot}>{l.lot} · {n(l.expected)} pcs</option>
                  ))}
                </select>
              ) : (
                <p className="muted">No open {typeName(type)} lots. Sync first, or issue one.</p>
              )}
            </div>
            <Stepper label="Good pieces received" value={f.qty} set={(v) => setF({ ...f, qty: v })} step={10} big />
            <Stepper label="Rejected pieces" value={f.rejects} set={(v) => setF({ ...f, rejects: v })} />
            {Number(f.rejects) > 0 && <Stepper label="Plastic bushes damaged (of the rejected pieces)" value={f.bushRejects} set={(v) => setF({ ...f, bushRejects: v })} />}
            {Number(f.rejects) > 0 && <p className="muted">The other bushes on rejected pieces go back into stock.</p>}
            <div className="field">
              <label>Job-work charge (₹)</label>
              <input aria-label="Job-work charge (₹)" inputMode="decimal" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value.replace(/[^0-9.]/g, '') })} placeholder={rate > 0 ? `₹${n(Math.round(Number(f.qty || 0) * rate * 100) / 100)} at ₹${n(rate)} a piece` : 'optional'} />
              <p className="muted">{rate > 0 ? 'Leave blank to use the rate. Only type a charge if the vendor agreed something else.' : 'No rate is set in the office app for this type, so type the charge if there is one.'}</p>
            </div>
            {chosen && Number(f.qty) + Number(f.rejects || 0) < chosen.expected && <p className="warn">Short by {n(chosen.expected - Number(f.qty || 0) - Number(f.rejects || 0))} pieces.</p>}
          </>
        )}
        {action === 'run' && (
          <>
            <Stepper label="Good pieces moulded" value={f.qty} set={(v) => setF({ ...f, qty: v })} step={10} big />
            <Stepper label="Rejects" value={f.rejects} set={(v) => setF({ ...f, rejects: v })} />
            <Stepper label="Plastic bushes rejected (damaged)" value={f.bushRejects} set={(v) => setF({ ...f, bushRejects: v })} />
            <p className="muted">Plastic bushes are reusable: after moulding they go back into stock, except the ones you reject here.</p>
            <div className="field"><label>Press / note</label><input aria-label="Press / note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Press 2" /></div>
          </>
        )}
        {err && <div className="err" role="alert">{err}</div>}
        <div className="row">
          <button className="btn ghost" onClick={() => setStep('type')}>Back</button>
          <button className="btn" onClick={review}>Review</button>
        </div>
      </div>
    )

  if (step === 'confirm') {
    const s = scan()
    return (
      <div className="screen">
        <h2>Check and send</h2>
        <div className="card sum">
          <div><span>Process</span><b>{PROCESSES[process].name}{action === 'issue' ? ' · issue' : action === 'receive' ? ' · receive' : ''}</b></div>
          <div><span>Type</span><b>{typeName(type)}</b></div>
          {s.lot && <div><span>Lot</span><b>{s.lot}</b></div>}
          {action === 'issue' && <div><span>Vendor</span><b>{meta?.vendors?.find((v) => v.id === f.sup)?.name}</b></div>}
          <div><span>{action === 'issue' ? 'Expected back' : 'Good pieces'}</span><b>{n(s.qty)}</b></div>
          {action !== 'issue' && <div><span>Rejects</span><b>{n(s.rejects)}</b></div>}
          {s.bushRejects > 0 && <div><span>Bushes rejected</span><b>{n(s.bushRejects)}</b></div>}
          {s.charge > 0 && <div><span>Charge</span><b>₹{n(s.charge)}</b></div>}
          {s.note && <div><span>Note</span><b>{s.note}</b></div>}
        </div>
        <p className="muted">{meta ? (meta.approve ? 'The office approves this before stock changes.' : 'Stock changes as soon as this reaches the office app.') : ''}</p>
        <div className="row">
          <button className="btn ghost" onClick={() => setStep('form')}>Edit</button>
          <button className="btn" onClick={submit}>Send</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen center">
      <div className="tick">✓</div>
      <h2>{sent ? 'Sent' : 'Saved on this phone'}</h2>
      <p className="muted">{sent ? 'The office app has it.' : 'It will be sent as soon as there is a connection.'}</p>
      <button className="btn" onClick={reset}>Scan another</button>
    </div>
  )
}

// ---- activity, sync -------------------------------------------------------------------------------------
