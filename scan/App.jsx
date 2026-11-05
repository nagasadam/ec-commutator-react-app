import { useCallback, useEffect, useRef, useState } from 'react'
import { configFromEnv, createFirebase, authMessage } from '../src/lib/firebase.js'
import { TYPES, PROCESSES, parseQr, parsePair, bizTag, scanProblem, nextLot, typeName } from '../src/lib/process.js'

const KEY = 'processscan1'
const load = () => {
  try {
    return { biz: '', queue: [], meta: null, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { biz: '', queue: [], meta: null }
  }
}
const save = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked: the queue stays in memory for this visit */
  }
}
const uid = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36))
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const n = (x) => Number(x || 0).toLocaleString('en-IN')

// ---- camera ---------------------------------------------------------------------------------------------
function Camera({ onText }) {
  const video = useRef(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let stop = false
    let stream
    let timer
    ;(async () => {
      if (!('BarcodeDetector' in window)) return setMsg('This phone’s browser cannot read QR codes in the page. Type the code printed under the QR instead.')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stop) return stream.getTracks().forEach((t) => t.stop())
        video.current.srcObject = stream
        await video.current.play()
        const det = new window.BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stop) return
          try {
            const r = await det.detect(video.current)
            if (r[0]?.rawValue) return onText(r[0].rawValue)
          } catch {
            /* a frame that cannot be read: try the next one */
          }
          timer = setTimeout(tick, 250)
        }
        tick()
      } catch {
        setMsg('The camera is not available. Allow camera access, or type the code printed under the QR.')
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cam">
      <video ref={video} playsInline muted />
      <div className="reticle" />
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}

function Stepper({ label, value, set, step = 1, big }) {
  const v = Number(value) || 0
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stepper">
        <button type="button" onClick={() => set(String(Math.max(0, v - step)))} aria-label={`less ${label}`}>−</button>
        <input inputMode="decimal" value={value} placeholder="0" onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} className={big ? 'big' : ''} />
        <button type="button" onClick={() => set(String(v + step))} aria-label={`more ${label}`}>+</button>
      </div>
    </div>
  )
}

// ---- the scan flow --------------------------------------------------------------------------------------
function ScanFlow({ app }) {
  const { st, user, add, pair } = app
  const [process, setProcess] = useState(null)
  const [action, setAction] = useState('')
  const [type, setType] = useState('')
  const [f, setF] = useState({ qty: '', rejects: '', charge: '', sup: '', lot: '', note: '' })
  const [step, setStep] = useState('aim') // aim | type | form | confirm | done
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(null)

  const reset = () => {
    setProcess(null); setAction(''); setType(''); setF({ qty: '', rejects: '', charge: '', sup: '', lot: '', note: '' }); setStep('aim'); setErr(''); setCode('')
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

  const pickType = (t) => {
    setType(t)
    setF((x) => ({ ...x, lot: '', qty: '', rejects: '', charge: '' }))
    if (process === 'stacking' && action === 'issue') setF((x) => ({ ...x, lot: nextLot([...(meta?.lots || []).map((l) => l.lot), ...queuedLots]) }))
    setStep('form')
  }
  const scan = () => ({
    id: uid(), process, action, type, date: today(), by: user?.email || '', at: new Date().toISOString(),
    qty: Number(f.qty), rejects: f.rejects === '' ? 0 : Number(f.rejects), lot: f.lot || undefined, sup: action === 'issue' ? f.sup : chosen?.sup || '', charge: action === 'receive' ? Number(f.charge || 0) : undefined, note: f.note.trim() || undefined,
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
        {err && <div className="err">{err}</div>}
        <div className="card">
          <label className="small">Camera not working? Type the code under the QR</label>
          <div className="row">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V4|STACKING|ab12" autoCapitalize="characters" />
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
            <div className="seg">
              {[['issue', 'Issue to vendor'], ['receive', 'Receive back']].map(([k, l]) => (
                <button key={k} className={action === k ? 'on' : ''} onClick={() => setAction(k)}>{l}</button>
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
              <select value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}>
                <option value="">Choose…</option>
                {(meta?.vendors || []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>Lot number</label><input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value.toUpperCase() })} /></div>
            <Stepper label="Pieces expected back" value={f.qty} set={(v) => setF({ ...f, qty: v })} step={100} big />
          </>
        )}
        {action === 'receive' && (
          <>
            <div className="field">
              <label>Lot coming back</label>
              {lotsForType.length ? (
                <select value={f.lot} onChange={(e) => { const l = openLots.find((x) => x.lot === e.target.value); setF({ ...f, lot: e.target.value, qty: l ? String(l.expected) : '' }) }}>
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
            <div className="field"><label>Job-work charge (₹)</label><input inputMode="decimal" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="optional" /></div>
            {chosen && Number(f.qty) + Number(f.rejects || 0) < chosen.expected && <p className="warn">Short by {n(chosen.expected - Number(f.qty || 0) - Number(f.rejects || 0))} pieces.</p>}
          </>
        )}
        {action === 'run' && (
          <>
            <Stepper label="Good pieces moulded" value={f.qty} set={(v) => setF({ ...f, qty: v })} step={10} big />
            <Stepper label="Rejects" value={f.rejects} set={(v) => setF({ ...f, rejects: v })} />
            <div className="field"><label>Press / note</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Press 2" /></div>
          </>
        )}
        {err && <div className="err">{err}</div>}
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
function Activity({ app }) {
  const { st, rows, lots } = app
  const [tab, setTab] = useState('vendor')
  return (
    <div className="screen">
      <h2>Activity</h2>
      <div className="seg">
        {[['vendor', `At vendor · ${lots.length}`], ['scans', 'Scans']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'vendor' &&
        (lots.length ? lots.map((l) => (
          <div className="card" key={l.lot}>
            <div className="row"><b className="grow">{l.lot} · {typeName(l.type)}</b><span className="pill warn">AT VENDOR</span></div>
            <p className="muted">{(st.meta?.vendors || []).find((v) => v.id === l.sup)?.name || 'Vendor'} · {n(l.expected)} pcs expected</p>
            <p className="muted">Issued {l.date}</p>
          </div>
        )) : <p className="muted">Nothing is out with a vendor.</p>)}
      {tab === 'scans' && (
        <>
          {st.queue.map((s) => (
            <div className="card" key={s.id}><div className="row"><b className="grow">{PROCESSES[s.process].name} · {typeName(s.type)} · {n(s.qty)}</b><span className="pill warn">NOT SENT</span></div></div>
          ))}
          {rows.map((r) => (
            <div className="card" key={r.id}>
              <div className="row"><b className="grow">{r.scan ? `${PROCESSES[r.scan.process]?.name} · ${typeName(r.scan.type)} · ${n(r.scan.qty)}` : 'Scan'}</b><span className={'pill ' + (r.status === 'applied' ? 'ok' : r.status === 'waiting' ? 'warn' : 'bad')}>{r.status.toUpperCase()}</span></div>
              <p className="muted">{(r.scan?.at || r.at || '').slice(0, 16).replace('T', ' ')}{r.note ? ' · ' + r.note : ''}</p>
            </div>
          ))}
          {!st.queue.length && !rows.length && <p className="muted">No scans yet.</p>}
        </>
      )}
    </div>
  )
}

function Sync({ app }) {
  const { st, user, signIn, signOut, sync, busy, pair, online, configured, denied } = app
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [pairCode, setPairCode] = useState('')
  return (
    <div className="screen">
      <h2>Sync</h2>
      {denied && <div className="err">This account is not set up for Process Scan. Ask the office to add your email.</div>}
      {!configured && <div className="err">The app is not connected to the cloud. Ask the office to check the app settings.</div>}
      <div className="card">
        <label className="small">CONNECTED TO MAIN APP</label>
        {user ? (
          <>
            <p><b>{st.meta?.name || (st.biz ? 'Business linked' : 'No business linked yet')}</b></p>
            <p className="muted">Signed in as {user.email} · {st.queue.length} waiting · {online ? 'online' : 'offline'}</p>
            <div className="row"><button className="btn ghost" disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync now'}</button><button className="btn ghost" onClick={signOut}>Sign out</button></div>
          </>
        ) : (
          <form onSubmit={async (e) => { e.preventDefault(); setErr(await signIn(email.trim(), pw)) }}>
            <div className="field"><label>Email</label><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Password</label><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            {err && <div className="err">{err}</div>}
            <button className="btn">Sign in</button>
          </form>
        )}
      </div>
      <div className="card">
        <label className="small">FIRST-TIME SETUP</label>
        <ol className="steps">
          <li>In the main app open <b>Process scan → QR posters</b>.</li>
          <li>Scan the <b>Pair a phone</b> QR on the Scan tab (or type its code below).</li>
          <li>Sign in with your usual email and password.</li>
        </ol>
        <div className="row"><input value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="PAIR|…" /><button className="btn ghost" onClick={() => { const p = parsePair(pairCode); if (p) { pair(p); setPairCode('') } }}>Link</button></div>
        {st.biz && <p className="muted">Linked to business {bizTag(st.biz)}.</p>}
      </div>
      {st.meta && <div className="card"><label className="small">SETTING (CHANGED IN THE MAIN APP)</label><p>Main app approves scans first: <b>{st.meta.approve ? 'ON' : 'OFF'}</b></p></div>}
    </div>
  )
}

// ---- app ------------------------------------------------------------------------------------------------
export default function App() {
  const [st, setSt] = useState(load)
  const stRef = useRef(st)
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('scan')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const fb = useRef(window.__scanTestApi || null)
  const cfg = configFromEnv(import.meta.env || {})
  const configured = !!(fb.current || cfg)

  const patch = useCallback((p) => {
    stRef.current = { ...stRef.current, ...(typeof p === 'function' ? p(stRef.current) : p) }
    save(stRef.current)
    setSt(stRef.current)
  }, [])

  useEffect(() => {
    let off = () => {}
    ;(async () => {
      try {
        if (!fb.current && cfg) fb.current = await createFirebase(cfg)
        if (fb.current) off = fb.current.onUser((u) => { setUser(u); setReady(true) })
        else setReady(true)
      } catch {
        setReady(true)
      }
    })()
    const on = () => setOnline(true)
    const offl = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', offl)
    return () => { off(); window.removeEventListener('online', on); window.removeEventListener('offline', offl) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useCallback(async () => {
    const api = fb.current?.scans
    const s = stRef.current
    if (!api || !s.biz) return
    setBusy(true)
    try {
      for (const q of [...s.queue]) {
        await api.add(s.biz, q)
        patch((c) => ({ queue: c.queue.filter((x) => x.id !== q.id) }))
      }
      patch({ meta: (await api.getMeta(s.biz)) || stRef.current.meta })
      const all = await api.list(s.biz, true)
      setRows(all.sort((a, b) => (b.scan?.at || b.at).localeCompare(a.scan?.at || a.at)).slice(0, 40))
      setDenied(false)
    } catch (e) {
      // offline: the queue is kept and retried on the next sync; a refusal means this account is not set up for scanning
      if (/permission|insufficient/i.test(String(e?.code || e?.message))) setDenied(true)
    } finally {
      setBusy(false)
    }
  }, [patch])

  useEffect(() => {
    if (user && st.biz && online) sync()
  }, [user, st.biz, online]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (scan) => {
    patch((c) => ({ queue: [...c.queue, scan] }))
    if (!fb.current?.scans || !user || !navigator.onLine) return false
    await sync()
    return !stRef.current.queue.some((q) => q.id === scan.id)
  }
  const app = {
    st, user, rows, busy, online, configured, add, denied,
    pair: (biz) => patch({ biz, meta: null }),
    signIn: async (e, p) => { try { await fb.current.signIn(e, p); return '' } catch (x) { return authMessage(x) } },
    signOut: () => fb.current?.signOut(),
    sync,
    lots: st.meta?.lots || [],
  }

  if (!ready) return <div className="screen center"><p className="muted">Loading…</p></div>
  const needLogin = configured && !user
  return (
    <div className="shell">
      {!online && <div className="offline">Offline. Scans are saved on this phone and sent later.</div>}
      <main>
        {needLogin && tab === 'scan' ? (
          <div className="screen center"><h2>Sign in first</h2><p className="muted">Scans are only accepted from signed-in people.</p><button className="btn" onClick={() => setTab('sync')}>Go to Sync</button></div>
        ) : tab === 'scan' ? <ScanFlow app={app} /> : tab === 'act' ? <Activity app={app} /> : <Sync app={app} />}
      </main>
      <nav>
        {[['scan', 'Scan'], ['act', 'Activity'], ['sync', 'Sync']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="ico" />{l}{k === 'sync' && st.queue.length > 0 ? <i>{st.queue.length}</i> : null}
          </button>
        ))}
      </nav>
    </div>
  )
}
