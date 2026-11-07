import { useState } from 'react'
import { Field } from './ui.jsx'
import { useCloud } from './cloud.jsx'
import { Logo } from './shellui.jsx'

export function Login() {
  const cloud = useCloud()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(await cloud.signIn(email.trim(), pw))
    setBusy(false)
  }
  const [show, setShow] = useState(false)
  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <Logo big />
        <h1>E.C Commutator</h1>
        <p className="sub-t">Sign in to ERP for Manufacturers</p>
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <span className="pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <button type="button" className="showpw" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </span>
        </Field>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="foot-t">Billing · Production · Stock</p>
      </form>
      <a className="scan-card" href="./scan/">
        <span className="ico" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" /></svg>
        </span>
        <span className="txt">
          <b>Process Scan</b>
          <span>Shop floor: stacking, moulding, rejects</span>
        </span>
        <svg className="go" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
    </div>
  )
}

// Initials of the business name (dots ignored, so "E.C Commutators" gives EC).
