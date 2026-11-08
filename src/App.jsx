import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useDragControls, EASE } from './motion.jsx'
import { useStore } from './lib/store.jsx'
import { useDialog, useMedia } from './ui.jsx'
import { useCloud } from './cloud.jsx'
import Invoices from './tabs/Invoices.jsx'
import Dashboard from './tabs/Dashboard.jsx'
import { Icon } from './icons.jsx'
import ErrorBoundary from './errorboundary.jsx'
import { Logo } from './shellui.jsx'
import { Login } from './login.jsx'
import NoAccess from './noaccess.jsx'
import { Manage, initials } from './manage.jsx'

// Dashboard and Invoices load with the app; the other pages download the first time they are opened
// (and are fetched in the background once the app is idle, so they still open instantly).
const retry = (load) => load().catch(() => new Promise((r) => setTimeout(r, 600)).then(load)) // one retry for a flaky connection
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
  ProcessScan: () => import('./tabs/ProcessScan.jsx'),
  JobWork: () => import('./tabs/JobWork.jsx'),
  Reports: () => import('./tabs/Reports.jsx'),
}
const Ledgers = lazy(() => retry(loaders.Ledgers))
const CashPeople = lazy(() => retry(loaders.CashPeople))
const Inventory = lazy(() => retry(loaders.Inventory))
const Production = lazy(() => retry(loaders.Production))
const Purchases = lazy(() => retry(loaders.Purchases))
const Expenses = lazy(() => retry(loaders.Expenses))
const Returns = lazy(() => retry(loaders.Returns))
const Parties = lazy(() => retry(loaders.Parties))
const Banking = lazy(() => retry(loaders.Banking))
const ProcessScan = lazy(() => retry(loaders.ProcessScan))
const JobWork = lazy(() => retry(loaders.JobWork))
const Reports = lazy(() => retry(loaders.Reports))

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
  ['ps', 'Process scan', ProcessScan, 'Stacking & moulding scans'],
  ['jw', 'Job work', JobWork, 'Vendor job-work bills'],
]

// V4 mark: the white-background artwork on light themes, the original on dark ones.
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
  const { b, saveErr } = useStore()
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
  const phone = useMedia('(max-width: 560px)')
  const hist = useRef([]) // tabs visited before this one, for swipe-from-edge back
  const [dir, setDir] = useState(1)
  const [pull, setPull] = useState(0) // pull-to-refresh distance (phones, cloud only)
  const pullRef = useRef({ y: 0, on: false })
  const go = (id, fresh, back) => {
    if (!back && id !== tab) hist.current = [...hist.current.slice(-9), tab]
    setDir(back ? -1 : 1)
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
  // On a phone, a table that is wider than its card turns into a list of small cards: each cell gets its column name as a label.
  useEffect(() => {
    if (!phone) return undefined
    const root = document.querySelector('.content')
    if (!root) return undefined
    let raf = 0
    const run = () => {
      raf = 0
      root.querySelectorAll('table:not(.stk)').forEach((t) => {
        const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim())
        if (!heads.length) return
        if (!t.classList.contains('cardtbl')) {
          const w = t.closest('.tw') || t.parentElement
          if (!w || w.scrollWidth <= w.clientWidth + 2) return
          t.classList.add('cardtbl')
        }
        t.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
          let i = 0
          ;[...tr.children].forEach((td) => {
            if (!td.hasAttribute('data-l') && heads[i]) td.setAttribute('data-l', heads[i])
            td.classList.toggle('long', td.textContent.trim().length > 24)
            i += td.colSpan || 1
          })
        })
      })
    }
    const mo = new MutationObserver(() => raf || (raf = requestAnimationFrame(run)))
    mo.observe(root, { childList: true, subtree: true })
    run()
    return () => (mo.disconnect(), raf && cancelAnimationFrame(raf))
  }, [phone, tab])
  // iOS large titles: the big page title scrolls away and a small one fades into the top bar.
  useEffect(() => {
    const on = () => document.documentElement.style.setProperty('--sc', String(Math.max(0, Math.min(1, (window.scrollY - 40) / 50))))
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [tab])
  // Swipe in from the left edge to go back to the page you came from.
  const goRef = useRef(null)
  goRef.current = go
  useEffect(() => {
    const e0 = { x: 0, y: 0, on: false, dx: 0 }
    const el = () => document.querySelector('.content')
    const ts = (e) => {
      const t = e.touches[0]
      Object.assign(e0, { x: t.clientX, y: t.clientY, dx: 0, on: t.clientX < 24 && hist.current.length > 0 && !document.querySelector('.ov, .sheet') })
    }
    const tm = (e) => {
      if (!e0.on) return
      const t = e.touches[0]
      const dx = t.clientX - e0.x
      if (Math.abs(t.clientY - e0.y) > Math.abs(dx) * 0.8 && dx < 30) return (e0.on = false)
      e0.dx = Math.max(0, dx)
      if (el()) {
        el().style.transition = 'none'
        el().style.transform = `translateX(${Math.min(e0.dx, 140) * 0.7}px)`
        el().style.opacity = String(1 - Math.min(e0.dx, 200) / 600)
      }
    }
    const te = () => {
      if (!e0.on) return
      e0.on = false
      if (el()) {
        el().style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.3s'
        el().style.transform = ''
        el().style.opacity = ''
      }
      if (e0.dx > 80) {
        const prev = hist.current[hist.current.length - 1]
        hist.current = hist.current.slice(0, -1)
        goRef.current(prev, false, true)
      }
    }
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te)
    window.addEventListener('touchcancel', te)
    return () => {
      window.removeEventListener('touchstart', ts)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', te)
      window.removeEventListener('touchcancel', te)
    }
  }, [])
  // Pull down from the top of a page to sync, like iOS.
  const syncRef = useRef(null)
  syncRef.current = cloud.configured && cloud.user ? cloud.syncNow : null
  useEffect(() => {
    const st = pullRef.current
    const ts = (e) => {
      const ok = syncRef.current && window.scrollY <= 0 && !document.querySelector('.ov, .sheet')
      st.on = !!ok
      st.y = e.touches[0].clientY
    }
    const tm = (e) => {
      if (!st.on) return
      const d = e.touches[0].clientY - st.y
      if (d <= 0) return setPull(0)
      setPull(Math.min(90, d * 0.5))
    }
    const te = () => {
      if (!st.on) return
      st.on = false
      setPull((p) => {
        if (p >= 60) syncRef.current?.()
        return 0
      })
    }
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te)
    return () => {
      window.removeEventListener('touchstart', ts)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', te)
    }
  }, [])
  const Cur = TABS.find((t) => t[0] === tab)[2]

  const cur = TABS.find((t) => t[0] === tab)
  const title = cur[3] || cur[1]

  if (cloud.configured && !cloud.ready) return <div className="login"><p className="muted">Loading…</p></div>
  if (cloud.configured && !cloud.user) return <Login />
  if (cloud.configured && cloud.user && cloud.access !== 'yes') return <NoAccess />
  const cloudOn = cloud.configured && cloud.user
  const live = saveErr ? 'Not saved' : cloudOn ? CLOUD_TEXT[cloud.status] || 'Saved' : 'Saved on this device'

  return (
    <div className="app">
      <div className={'ptr' + (cloud.status === 'syncing' ? ' spin' : '')} aria-hidden="true" style={{ opacity: pull ? Math.min(1, pull / 60) : cloud.status === 'syncing' ? 1 : 0, transform: `translateY(${pull ? pull : cloud.status === 'syncing' ? 56 : 0}px) rotate(${pull * 4}deg)`, transition: pull ? 'none' : 'transform 0.3s, opacity 0.3s' }}>
        <Icon n="sync" />
      </div>
      <header className="top glass">
        <div className="brand">
          <Logo />
          <span className="vh">E.C Commutator</span>
        </div>
        <span className="topttl" aria-hidden="true">{title}</span>
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
          {cloud.scanAccess && (
            <div className="appsw" role="group" aria-label="Switch app">
              <span aria-current="page">ERP App</span>
              <a href="./scan/">
                Process Scan <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
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
        {cloud.sizeWarn && <div className="cloudbar">This business is nearing the size limit for cloud sync. Export a backup and start a new business for the next year.</div>}
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
        <motion.main key={b.id + tab} className={tab === 'inv' && newInv ? 'nofx' : ''} initial={tab === 'inv' && newInv ? false : phone ? { opacity: 0, x: 28 * dir } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, x: 0 }} transition={phone ? { type: 'spring', stiffness: 420, damping: 34 } : { duration: 0.32, ease: EASE }}>
          <ErrorBoundary>
            <Suspense fallback={<div className="pageload" role="status" aria-label="Loading page" />}>
              <Cur go={go} newInv={tab === 'inv' ? newInv : 0} />
            </Suspense>
          </ErrorBoundary>
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

