import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useDragControls, EASE } from './motion.jsx'
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
import Dashboard from './tabs/Dashboard.jsx'
import { Icon } from './icons.jsx'

const PRIMARY = ['dash', 'inv', 'pur', 'stk', 'rep']
const MOBILE = ['dash', 'inv', 'pur']
const TABS = [
  ['dash', 'Dashboard', Dashboard, 'Dashboard'],
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
        <span className="logo big" aria-hidden="true" />
        <h1>E.C Commutator</h1>
        <p className="sub-t">Sign in to ERP for Manufacturers</p>
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <span className="pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <button type="button" className="showpw" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </span>
        </Field>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="btn ghost block" onClick={() => cloud.setSkip(true)}>Use on this device only</button>
        <p className="foot-t">Billing · Production · Stock</p>
      </form>
    </div>
  )
}

// Initials of the business name (dots ignored, so "E.C Commutators" gives EC).
const initials = (n) => {
  const w = (n || '').replace(/\./g, '').split(/\s+/).filter(Boolean)
  return ((w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)) || '?').toUpperCase()
}

const THEME_KEY = 'ecc-theme'
function useTheme() {
  const [t, setT] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    if (t) document.documentElement.setAttribute('data-theme', t)
    else document.documentElement.removeAttribute('data-theme')
  }, [t])
  const dark = t ? t === 'dark' : typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const toggle = () => {
    const n = dark ? 'light' : 'dark'
    setT(n)
    try {
      localStorage.setItem(THEME_KEY, n)
    } catch {}
  }
  return [dark, toggle]
}


const CLOUD_TEXT = { idle: 'Cloud connected', syncing: 'Syncing…', saved: 'Saved to cloud', offline: 'Offline: saved on this device', error: 'Cloud error: saved on this device', choice: 'Choose what to do with local data' }

export default function App() {
  const { S, upd, b, saveErr } = useStore()
  const cloud = useCloud()
  const { ask } = useDialog()
  const [tab, setTab] = useState('dash')
  const [manage, setManage] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [newInv, setNewInv] = useState(0)
  const drag = useDragControls()
  const [ind, setInd] = useState({ x: 0, w: 0, o: 0 })
  const [dark, toggleTheme] = useTheme()
  const navRef = useRef(null)
  const go = (id, fresh) => {
    setNewInv((n) => (fresh ? n + 1 : 0)) // only a New invoice click asks the Invoices page to open its form
    setTab(id)
    setMoreOpen(false)
    setSheet(false)
    window.scrollTo?.({ top: 0 })
  }
  // sliding pill: measure the active button, Motion springs the pill to it
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const place = () => {
      const on = nav.querySelector('button.on:not(.menu-item)')
      if (on) {
        const n = nav.getBoundingClientRect()
        const r = on.getBoundingClientRect()
        setInd({ x: r.left - n.left, w: r.width, o: 1 })
      } else setInd((i) => ({ ...i, o: 0 }))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [tab, cloud.ready, cloud.user])
  useEffect(() => {
    if (!moreOpen) return undefined
    const close = (e) => !e.target.closest?.('.more') && setMoreOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [moreOpen])
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
        <nav ref={navRef} aria-label="Sections">
          <motion.i className="nav-ind" aria-hidden="true" initial={false} animate={{ x: ind.x, width: ind.w, opacity: ind.o }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          {TABS.filter((t) => PRIMARY.includes(t[0])).map(([id, l]) => (
            <button key={id} className={id === tab ? 'on' : ''} onClick={() => go(id)}>
              {l}
            </button>
          ))}
          <div className="more">
            <button className={!PRIMARY.includes(tab) ? 'on' : ''} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              {!PRIMARY.includes(tab) ? cur[1] : 'More'} ▾
            </button>
            <AnimatePresence>
              {moreOpen && (
              <motion.div className="menu" role="menu" initial={{ opacity: 0, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.18, ease: EASE }}>
                {TABS.filter((t) => !PRIMARY.includes(t[0])).map(([id, l]) => (
                  <button key={id} role="menuitem" className={'menu-item' + (id === tab ? ' on' : '')} onClick={() => go(id)}>
                    {l}
                  </button>
                ))}
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>
        <div className="right">
          <span className={'live' + (saveErr || cloud.status === 'error' ? ' bad' : cloudOn ? ' cloud' : '')} title={live} role="status">
            <i />
            <span className="lt">{live}</span>
          </span>
          {cloudOn && (
            <button className={'iconbtn' + (cloud.status === 'syncing' ? ' spin' : '')} onClick={cloud.syncNow} aria-label="Sync now" title="Sync now">
              <Icon n="sync" />
            </button>
          )}
          <button className="iconbtn" onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
            <Icon n={dark ? 'sun' : 'moon'} />
          </button>
          <div className="bsel">
            <span className="who">
              <span className="avatar" aria-hidden="true">{initials(b.name)}</span>
              <select value={S.cur} onChange={(e) => upd((s) => (s.cur = e.target.value))} aria-label="Business">
                {S.biz.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </span>
            <button className="btn ghost manage" onClick={() => setManage(true)}>
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
        {tab !== 'inv' && tab !== 'pur' && (
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
        )}
        <motion.main key={b.id + tab} className={tab === 'inv' && newInv ? 'nofx' : ''} initial={tab === 'inv' && newInv ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE }}>
          <Cur go={go} newInv={tab === 'inv' ? newInv : 0} />
        </motion.main>
      </div>
      <div className="tabbar" role="navigation" aria-label="Quick tabs">
        {MOBILE.slice(0, 2).map((id) => (
          <button key={id} className={id === tab ? 'on' : ''} onClick={() => go(id)}>
            <Icon n={id} />
            {TABS.find((t) => t[0] === id)[1]}
          </button>
        ))}
        <button className="fab" aria-label="New invoice" onClick={() => go('inv', true)}>+</button>
        {MOBILE.slice(2).map((id) => (
          <button key={id} className={id === tab ? 'on' : ''} onClick={() => go(id)}>
            <Icon n={id} />
            {TABS.find((t) => t[0] === id)[1]}
          </button>
        ))}
        <button className={!MOBILE.includes(tab) ? 'on' : ''} onClick={() => setSheet(true)} aria-label="More sections">
          <Icon n="more" />
          More
        </button>
      </div>
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div key="scrim" className="sheet-scrim" onClick={() => setSheet(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
            <motion.div
              key="sheet"
              className="sheet"
              role="dialog"
              aria-label="All sections"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag="y"
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, i) => (i.offset.y > 90 || i.velocity.y > 500) && setSheet(false)}
            >
              <div className="grab" onPointerDown={(e) => drag.start(e)} />
              <div className="sh"><h4>All sections</h4><button className="btn ghost" onClick={() => { setSheet(false); setManage(true) }}>Manage</button></div>
              <div className="tiles">
                {TABS.map(([id, l], k) => (
                  <motion.button key={id} className={id === tab ? 'on' : ''} onClick={() => go(id)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.08 + k * 0.03 }} whileTap={{ scale: 0.95 }}><Icon n={id} />{l}</motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {manage && <Manage onClose={() => setManage(false)} />}
    </div>
  )
}
