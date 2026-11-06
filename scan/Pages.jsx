import { useState } from 'react'
import { PROCESSES, parsePair, bizTag, typeName } from '../src/lib/process.js'
import { n } from './storage.js'

export function Activity({ app }) {
  const { st, rows, lots } = app
  const [tab, setTab] = useState('vendor')
  return (
    <div className="screen">
      <h2>Activity</h2>
      <div className="seg" role="tablist" aria-label="Activity view">
        {[['vendor', `At vendor · ${lots.length}`], ['scans', 'Scans']].map(([k, l]) => (
          <button key={k} role="tab" className={tab === k ? 'on' : ''} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
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

export function Sync({ app }) {
  const { st, user, signIn, signOut, sync, busy, pair, online, configured, denied } = app
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [pairCode, setPairCode] = useState('')
  return (
    <div className="screen">
      <h2>Sync</h2>
      {denied && <div className="err" role="alert">This account is not set up for Process Scan. Ask the office to add your email. <small>(Details: {denied})</small></div>}
      {!configured && <div className="err" role="alert">The app is not connected to the cloud. Ask the office to check the app settings.</div>}
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
            <div className="field"><label>Email</label><input aria-label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Password</label><input aria-label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            {err && <div className="err" role="alert">{err}</div>}
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
        <div className="row"><input aria-label="Pairing code" value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="PAIR|…" /><button className="btn ghost" onClick={() => { const p = parsePair(pairCode); if (p) { pair(p); setPairCode('') } }}>Link</button></div>
        {st.biz && <p className="muted">Linked to business {bizTag(st.biz)}.</p>}
      </div>
      {st.meta && <div className="card"><label className="small">SETTING (CHANGED IN THE MAIN APP)</label><p>Main app approves scans first: <b>{st.meta.approve ? 'ON' : 'OFF'}</b></p></div>}
    </div>
  )
}

// ---- app ------------------------------------------------------------------------------------------------
