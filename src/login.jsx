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
    </div>
  )
}

// Initials of the business name (dots ignored, so "E.C Commutators" gives EC).
