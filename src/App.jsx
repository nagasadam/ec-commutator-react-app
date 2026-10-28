import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useDragControls, EASE } from './motion.jsx'
import { useStore } from './lib/store.jsx'
import { mkBiz } from './lib/model.js'
import { demoBiz } from './lib/seed.js'
import { Field, Modal, useDialog } from './ui.jsx'
import { useToast } from './toast.jsx'
import { useCloud } from './cloud.jsx'
import { exportJson, mergeBackup, parseBackup } from './lib/backup.js'
import { bizNameTaken, kindSwitchError } from './lib/rules.js'
import { uid } from './lib/format.js'
import Invoices from './tabs/Invoices.jsx'
import Dashboard from './tabs/Dashboard.jsx'
import { Icon } from './icons.jsx'
import { light as logoLight, dark as logoDark } from './assets/logos.js'

// Dashboard and Invoices load with the app; the other pages download the first time they are opened
// (and are fetched in the background once the app is idle, so they still open instantly).
const loaders = {
  Ledgers: () => import('./tabs/Ledgers.jsx'),
  CashPeople: () => import('./tabs/CashPeople.jsx'),
  Inventory: () => import('./tabs/Inventory.jsx'),
  Production: () => import('./tabs/Production.jsx'),
  Purchases: () => import('./tabs/Purchases.jsx'),
  Expenses: () => import('./tabs/Expenses.jsx'),
  Returns: () => import('./tabs/Returns.jsx'),
  Parties: () => import('./tabs/Parties.jsx'),
  Banking: () => import('./tabs/Banking.jsx'),
  Reports: () => import('./tabs/Reports.jsx'),
}
const Ledgers = lazy(loaders.Ledgers)
const CashPeople = lazy(loaders.CashPeople)
const Inventory = lazy(loaders.Inventory)
const Production = lazy(loaders.Production)
const Purchases = lazy(loaders.Purchases)
const Expenses = lazy(loaders.Expenses)
const Returns = lazy(loaders.Returns)
const Parties = lazy(loaders.Parties)
const Banking = lazy(loaders.Banking)
const Reports = lazy(loaders.Reports)

const PRIMARY = ['dash', 'inv', 'pur', 'stk', 'rep']
const MOBILE = ['dash', 'inv', 'par', 'pur']
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

// V4 mark: the white-background artwork on light themes, the original on dark ones.
function Logo({ big }) {
  const c = 'logo' + (big ? ' big' : '')
  const sizes = big ? '72px' : '34px'
  return (
    <span className={'logo-wrap' + (big ? ' big' : '')} aria-hidden="true">
      <img className={c + ' lt'} src={logoLight.src} srcSet={logoLight.srcSet} sizes={sizes} alt="" decoding="async" loading="lazy" />
      <img className={c + ' dk'} src={logoDark.src} srcSet={logoDark.srcSet} sizes={sizes} alt="" decoding="async" loading="lazy" />
    </span>
  )
}

function Sec({ tone, icon, title, hint, children }) {
  return (
    <section className={'mgr-sec' + (tone ? ' ' + tone : '')}>
      <header>
        <span className="mgr-ico" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h4>{title}</h4>
          {hint && <p className="muted">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function Settings() {
  const { S, b, updB } = useStore()
  const { tell } = useDialog()
  const [name, setName] = useState(b.name)
  const [kind, setKind] = useState(b.kind)
  const [sc, setSc] = useState(b.stateCode)
  const [err, setErr] = useState('')
  const dirty = name !== b.name || kind !== b.kind || sc !== b.stateCode

  const save = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErr('Enter a name for the business.')
    if (bizNameTaken(S.biz, n, b.id)) return setErr(`Another business is already named "${n}". Use a different name.`)
    if (kind !== b.kind) {
      const bad = kindSwitchError(b, kind)
      if (bad) return tell(bad)
    }
    updB((x) => {
      x.name = n
      x.kind = kind
      x.stateCode = sc
    })
    setName(n)
    setErr('')
  }
  return (
    <Sec icon="⚙" title={b.name} hint="Settings for this business">
      <form onSubmit={save}>
        <Field label="Business name">
          <input value={name} onChange={(e) => (setName(e.target.value), setErr(''))} aria-invalid={!!err} />
        </Field>
        {err && <p className="mgr-err" role="alert">{err}</p>}
        <Field label="Business type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="person">Person based (BILL, cash/GPay and firms)</option>
            <option value="firm">Firm based (firms with GSTIN, bank only)</option>
          </select>
        </Field>
        <Field label="Your GST state code (first 2 digits of your GSTIN)">
          <input value={sc} maxLength={2} onChange={(e) => setSc(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <p className="muted">Sales to a customer with the same state code get CGST + SGST; otherwise IGST.</p>
        <div className="mgr-acts">
          <button className="btn" disabled={!dirty}>Save changes</button>
          {dirty && (
            <button type="button" className="btn ghost" onClick={() => (setName(b.name), setKind(b.kind), setSc(b.stateCode), setErr(''))}>
              Discard
            </button>
          )}
        </div>
      </form>
    </Sec>
  )
}

function Manage({ onClose }) {
  const { S, upd, b, updB } = useStore()
  const { ask, tell } = useDialog()
  const toast = useToast()
  const cloud = useCloud()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('person')
  const [typed, setTyped] = useState('')
  const [addErr, setAddErr] = useState('')

  const add = (e) => {
    e.preventDefault()
    if (!name.trim()) return setAddErr('Enter a name for the business.')
    if (bizNameTaken(S.biz, name)) return setAddErr(`A business named "${name.trim()}" already exists. Use a different name.`)
    upd((s) => {
      const nb = mkBiz(name.trim(), kind)
      s.biz.push(nb)
      s.cur = nb.id
    })
    onClose()
  }
  const demo = () => {
    const dn = demoBiz().name
    if (bizNameTaken(S.biz, dn)) return setAddErr(`A business named "${dn}" already exists, so the demo data was not added.`)
    upd((s) => {
      const d = demoBiz()
      s.biz.push(d)
      s.cur = d.id
    })
    onClose()
  }
  const [loadingBig, setLoadingBig] = useState(false)
  // 3,000 test records (invoices, purchases, payments...) as a separate business, for trying the app at scale.
  const bigSample = async () => {
    setAddErr('')
    setLoadingBig(true)
    try {
      const { bigSampleBiz } = await import('./lib/sample.js')
      const nb = bigSampleBiz()
      if (bizNameTaken(S.biz, nb.name)) return setAddErr(`A business named "${nb.name}" already exists, so the test records were not added.`)
      upd((s) => {
        s.biz.push(nb)
        s.cur = nb.id
      })
      onClose()
    } finally {
      setLoadingBig(false)
    }
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
    <Modal title="Businesses" onClose={onClose} wide>
      <div className="mgr">
        <div className="mgr-list" role="group" aria-label="Switch business">
          {S.biz.map((x) => (
            <button key={x.id} type="button" className={'mgr-biz' + (x.id === S.cur ? ' on' : '')} onClick={() => x.id !== S.cur && upd((s) => (s.cur = x.id), { quiet: true })}>
              <span className="avatar" aria-hidden="true">{initials(x.name)}</span>
              <span>
                {x.name}
                <small>{x.kind === 'firm' ? 'Firm based' : 'Person based'}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="mgr-cols">
          <Sec icon="＋" title="Add business" hint="Start a separate set of books">
            <form onSubmit={add}>
              <Field label="Name">
                <input value={name} onChange={(e) => (setName(e.target.value), setAddErr(''))} aria-invalid={!!addErr} />
              </Field>
              {addErr && <p className="mgr-err" role="alert">{addErr}</p>}
              <Field label="Type">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="person">Person based (BILL, cash/GPay and firms)</option>
                  <option value="firm">Firm based</option>
                </select>
              </Field>
              <div className="mgr-acts">
                <button className="btn">Add</button>
                <button type="button" className="btn ghost" onClick={demo}>Load E.C Commutators demo data</button>
                <button type="button" className="btn ghost" onClick={bigSample} disabled={loadingBig}>{loadingBig ? 'Adding…' : 'Load 3,000 test records'}</button>
              </div>
            </form>
          </Sec>

          <Settings key={b.id} />

          <Sec icon="⇅" title="Backup" hint="Download everything, or bring a backup back in">
            <div className="mgr-acts">
              <button type="button" className="btn ghost" onClick={doExport}>Export all data (JSON)</button>
              <label className="btn ghost">
                Import backup
                <input type="file" accept="application/json,.json" hidden onChange={doImport} />
              </label>
            </div>
          </Sec>

          {cloud.configured && cloud.user && (
            <Sec icon="☁" title="Cloud" hint={`Signed in as ${cloud.user.email}`}>
              <div className="mgr-acts">
                <button type="button" className="btn ghost" onClick={cloud.syncNow}>Sync now</button>
                <button type="button" className="btn ghost" onClick={() => cloud.signOut().then(onClose)}>Sign out</button>
              </div>
            </Sec>
          )}
        </div>

        <Sec tone="danger" icon="!" title="Danger zone" hint="These cannot be undone">
          <div className="mgr-danger">
            <div>
              <button className="btn ghost" onClick={reset}>
                Reset this business
              </button>
              <p className="muted">Clears all entries and restores the default items.</p>
            </div>
            <div>
              <Field label={`Delete this business — type "${b.name}"`}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              <button className="btn danger" onClick={del}>
                Delete this business
              </button>
            </div>
          </div>
        </Sec>
      </div>
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
  // Once the app is idle, fetch the other pages' code in the background.
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((load) => load().catch(() => {}))
    const id = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [])
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
          <Logo />
          <span className="vh">E.C Commutator</span>
        </div>
        <nav ref={navRef} aria-label="Sections">
          <motion.i className="nav-ind" aria-hidden="true" initial={false} animate={{ x: ind.x, width: ind.w, opacity: ind.o }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          {TABS.filter((t) => PRIMARY.includes(t[0])).map(([id, l]) => (
            <button key={id} className={id === tab ? 'on' : ''} onClick={() => go(id)}>
              <Icon n={id} />
              {l}
            </button>
          ))}
          <div className="more">
            <button className={!PRIMARY.includes(tab) ? 'on' : ''} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <Icon n={!PRIMARY.includes(tab) ? tab : 'more'} />
              {!PRIMARY.includes(tab) ? cur[1] : 'More'} ▾
            </button>
            <AnimatePresence>
              {moreOpen && (
              <motion.div className="menu" role="menu" initial={{ opacity: 0, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.18, ease: EASE }}>
                {TABS.filter((t) => !PRIMARY.includes(t[0])).map(([id, l]) => (
                  <button key={id} role="menuitem" className={'menu-item' + (id === tab ? ' on' : '')} onClick={() => go(id)}>
                    <Icon n={id} />
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
          <button type="button" className="avatar avatar-btn" onClick={() => setManage(true)} aria-label="Manage businesses" title="Manage businesses">
            {initials(b.name)}
          </button>
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
            <h1 className="ptitle">
              <span className="hico"><Icon n={tab} /></span>
              {title}
            </h1>
          </div>
          <div className="r">
            <span className="chip">
              GST <b>18%</b>
            </span>
          </div>
        </div>
        )}
        <motion.main key={b.id + tab} className={tab === 'inv' && newInv ? 'nofx' : ''} initial={tab === 'inv' && newInv ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE }}>
          <Suspense fallback={<div className="pageload" role="status" aria-label="Loading page" />}>
            <Cur go={go} newInv={tab === 'inv' ? newInv : 0} />
          </Suspense>
        </motion.main>
      </div>
      <div className="tabbar" role="navigation" aria-label="Quick tabs">
        {MOBILE.map((id) => (
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
              <div className="sh"><h4>All sections</h4></div>
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
