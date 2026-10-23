import { useState } from 'react'
import { useStore } from './lib/store.jsx'
import { mkBiz } from './lib/model.js'
import { demoBiz } from './lib/seed.js'
import { Field, Modal, useDialog } from './ui.jsx'
import { useToast } from './toast.jsx'
import { useCloud } from './cloud.jsx'
import { exportJson, mergeBackup, parseBackup } from './lib/backup.js'
import { kindSwitchError } from './lib/rules.js'
import { uid } from './lib/format.js'
import Ledgers from './tabs/Ledgers.jsx'
import CashPeople from './tabs/CashPeople.jsx'
import Invoices from './tabs/Invoices.jsx'
import Inventory from './tabs/Inventory.jsx'
import Production from './tabs/Production.jsx'
import Purchases from './tabs/Purchases.jsx'
import Expenses from './tabs/Expenses.jsx'
import Returns from './tabs/Returns.jsx'
import Parties from './tabs/Parties.jsx'
import Banking from './tabs/Banking.jsx'
import Reports from './tabs/Reports.jsx'

const TABS = [
  ['inv', 'Invoices', Invoices],
  ['stk', 'Inventory', Inventory],
  ['pro', 'Production', Production],
  ['pur', 'Purchases', Purchases],
  ['exp', 'Expenses', Expenses],
  ['ret', 'Returns', Returns, 'Returns & rejects'],
  ['rep', 'Reports', Reports],
  ['par', 'Parties', Parties, 'Customers & suppliers'],
  ['led', 'Ledgers', Ledgers, 'Party statements'],
  ['cg', 'Cash & GPay', CashPeople, 'Cash & GPay people'],
  ['bank', 'Banking', Banking],
]

function Manage({ onClose }) {
  const { S, upd, b, updB } = useStore()
  const { ask, tell } = useDialog()
  const toast = useToast()
  const cloud = useCloud()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('person')
  const [typed, setTyped] = useState('')

  const add = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    upd((s) => {
      const nb = mkBiz(name.trim(), kind)
      s.biz.push(nb)
      s.cur = nb.id
    })
    onClose()
  }
  const demo = () => {
    upd((s) => {
      const d = demoBiz()
      s.biz.push(d)
      s.cur = d.id
    })
    onClose()
  }
  const reset = () =>
    ask(
      `Reset "${b.name}"? All its entries are cleared and items go back to the defaults.`,
      () => {
        updB((x) => {
          const fresh = mkBiz(x.name, x.kind)
          fresh.id = x.id
          delete x.demo
          Object.assign(x, fresh)
        })
        onClose()
      },
      'Reset',
    )
  const del = () => {
    if (S.biz.length < 2) return tell('You cannot delete the only business.')
    if (typed !== b.name) return tell('Type the business name exactly to confirm.')
    upd((s) => {
      s.biz = s.biz.filter((x) => x.id !== s.cur)
      s.cur = s.biz[0].id
    })
    onClose()
  }

  const setKind2 = (k) => {
    const bad = kindSwitchError(b, k)
    if (bad) return tell(bad)
    updB((x) => (x.kind = k))
  }
  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportJson(S)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ec-commutator-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast.push('Backup file created', 'ok')
  }
  const doImport = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = parseBackup(await f.text())
    if (r.error) return toast.push('Import failed: ' + r.error, 'err')
    upd((s) => Object.assign(s, mergeBackup(s, r.S, uid)))
    toast.push(`Imported ${r.S.biz.length} business${r.S.biz.length === 1 ? '' : 'es'}`, 'ok')
  }

  return (
    <Modal title="Businesses" onClose={onClose}>
      <form onSubmit={add}>
        <h4>Add business</h4>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="person">Person based (BILL, cash/GPay and firms)</option>
            <option value="firm">Firm based</option>
          </select>
        </Field>
        <button className="btn">Add</button> <button type="button" className="btn ghost" onClick={demo}>Load E.C Commutators demo data</button>
      </form>

      <h4>This business: {b.name}</h4>
      <Field label="Business type">
        <select value={b.kind} onChange={(e) => setKind2(e.target.value)}>
          <option value="person">Person based (BILL, cash/GPay and firms)</option>
          <option value="firm">Firm based (firms with GSTIN, bank only)</option>
        </select>
      </Field>
      <Field label="Your GST state code (first 2 digits of your GSTIN)">
        <input value={b.stateCode} maxLength={2} onChange={(e) => updB((x) => (x.stateCode = e.target.value.replace(/\D/g, '')))} />
      </Field>
      <p className="muted">Sales to a customer with the same state code get CGST + SGST; otherwise IGST.</p>
      <h4>Backup</h4>
      <button type="button" className="btn ghost" onClick={doExport}>Export all data (JSON)</button>{' '}
      <label className="btn ghost" style={{ display: 'inline-block' }}>
        Import backup
        <input type="file" accept="application/json,.json" hidden onChange={doImport} />
      </label>
      {cloud.configured && cloud.user && (
        <>
          <h4>Cloud</h4>
          <p className="muted">Signed in as {cloud.user.email}.</p>
          <button type="button" className="btn ghost" onClick={cloud.syncNow}>Sync now</button>{' '}
          <button type="button" className="btn ghost" onClick={() => cloud.signOut().then(onClose)}>Sign out</button>
        </>
      )}
      <h4>Danger zone</h4>
      <button className="btn ghost" onClick={reset}>
        Reset this business
      </button>
      <Field label={`Delete this business — type "${b.name}"`}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <button className="btn danger" onClick={del}>
        Delete this business
      </button>
    </Modal>
  )
}

function Login() {
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
  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <h3>Sign in</h3>
        <p className="muted">Your books sync to the cloud once you sign in.</p>
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </Field>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{' '}
        <button type="button" className="btn ghost" onClick={() => cloud.setSkip(true)}>Use on this device only</button>
      </form>
    </div>
  )
}

const CLOUD_TEXT = { idle: 'Cloud connected', syncing: 'Syncing…', saved: 'Saved to cloud', offline: 'Offline: saved on this device', error: 'Cloud error: saved on this device', choice: 'Choose what to do with local data' }

export default function App() {
  const { S, upd, b, saveErr } = useStore()
  const cloud = useCloud()
  const { ask } = useDialog()
  const [tab, setTab] = useState('inv')
  const [manage, setManage] = useState(false)
  const Cur = TABS.find((t) => t[0] === tab)[2]

  const cur = TABS.find((t) => t[0] === tab)
  const title = cur[3] || cur[1]

  if (cloud.configured && !cloud.ready) return <div className="login"><p className="muted">Loading…</p></div>
  if (cloud.configured && !cloud.user && !cloud.skip) return <Login />
  const cloudOn = cloud.configured && cloud.user
  const live = saveErr ? 'Not saved' : cloudOn ? CLOUD_TEXT[cloud.status] || 'Saved' : 'Saved on this device'

  return (
    <div className="app">
      <header className="top glass">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            E.C Commutator
            <small>Billing · Production · Stock</small>
          </div>
        </div>
        <nav>
          {TABS.map(([id, l]) => (
            <button key={id} className={id === tab ? 'on' : ''} onClick={() => setTab(id)}>
              {l}
            </button>
          ))}
        </nav>
        <div className="right">
          <span className={'live' + (saveErr || cloud.status === 'error' ? ' bad' : cloudOn ? ' cloud' : '')} title={live} role="status">
            <i />
            <span className="lt">{live}</span>
          </span>
          <div className="bsel">
            <select value={S.cur} onChange={(e) => upd((s) => (s.cur = e.target.value))} aria-label="Business">
              {S.biz.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <button className="btn ghost" onClick={() => setManage(true)}>
              Manage
            </button>
          </div>
        </div>
      </header>
      <div className="content">
        {saveErr && <div className="err sticky">{saveErr}</div>}
        {cloud.choice && (
          <div className="cloudbar" role="alert">
            <span>This device has entries the cloud has never seen.</span>
            <button className="btn" onClick={() => cloud.resolveChoice('add')}>Add them now</button>
            <button className="btn ghost" onClick={() => ask('Discard the entries that exist only on this device?', () => cloud.resolveChoice('discard'), 'Discard')}>Discard</button>
          </div>
        )}
        {cloud.sizeWarn && <div className="cloudbar">This business is nearing the cloud size limit. Export a backup and start a new business for the next year.</div>}
        <div className="head">
          <div>
            <div className="crumb">
              {b.name} / {title}
            </div>
            <h1>{title}</h1>
          </div>
          <div className="r">
            <span className="chip">
              GST <b>18%</b>
            </span>
          </div>
        </div>
        <main key={b.id + tab}>
          <Cur />
        </main>
      </div>
      {manage && <Manage onClose={() => setManage(false)} />}
    </div>
  )
}
