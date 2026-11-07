import { useCallback, useEffect, useRef, useState } from 'react'
import { configFromEnv, createFirebase, authMessage } from '../src/lib/firebase.js'
import { load, save } from './storage.js'
import ScanFlow from './ScanFlow.jsx'
import { Activity, Sync } from './Pages.jsx'

export default function App() {
  const [st, setSt] = useState(load)
  const stRef = useRef(st)
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('scan')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState('')
  const [both, setBoth] = useState(false) // signed in and listed for the ERP App too: then the switch shows
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

  useEffect(() => {
    setBoth(false)
    if (!user || !fb.current?.hasBoth) return undefined
    let live = true
    const key = 'ecc-both:' + String(user.email).toLowerCase() // remembered, so the switch survives a dead signal on the shop floor
    fb.current
      .hasBoth(user.email)
      .then((ok) => {
        try {
          if (ok) localStorage.setItem(key, '1')
          else localStorage.removeItem(key)
        } catch { /* storage blocked: the check runs again next time */ }
        if (live) setBoth(ok)
      })
      .catch(() => {
        try {
          if (live) setBoth(localStorage.getItem(key) === '1')
        } catch { /* ignore */ }
      })
    return () => { live = false }
  }, [user])

  const sync = useCallback(async () => {
    const api = fb.current?.scans
    const s = stRef.current
    if (!api || !s.biz) return
    setBusy(true)
    let step = 'sending scans'
    try {
      for (const q of [...s.queue]) {
        await api.add(s.biz, q)
        patch((c) => ({ queue: c.queue.filter((x) => x.id !== q.id) }))
      }
      step = 'reading vendor list'
      patch({ meta: (await api.getMeta(s.biz)) || stRef.current.meta })
      step = 'reading your scans'
      const all = await api.list(s.biz, true)
      setRows(all.sort((a, b) => (b.scan?.at || b.at).localeCompare(a.scan?.at || a.at)).slice(0, 40))
      setDenied('')
    } catch (e) {
      // offline: the queue is kept and retried on the next sync; a refusal means this account is not set up for scanning
      if (/permission|insufficient/i.test(String(e?.code || e?.message))) setDenied(`${step}: ${e?.code || e?.message}`)
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
      {both && (
        <div className="appsw" role="group" aria-label="Switch app">
          <span aria-current="page">Scan</span>
          <a href="../">ERP App <span aria-hidden="true">↗</span></a>
        </div>
      )}
      <main>
        {needLogin && tab === 'scan' ? (
          <div className="screen center"><h2>Sign in first</h2><p className="muted">Scans are only accepted from signed-in people.</p><button className="btn" onClick={() => setTab('sync')}>Go to Sync</button></div>
        ) : tab === 'scan' ? <ScanFlow app={app} /> : tab === 'act' ? <Activity app={app} /> : <Sync app={app} />}
      </main>
      <nav aria-label="Sections">
        {[['scan', 'Scan'], ['act', 'Activity'], ['sync', 'Sync']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} aria-label={k === 'sync' && st.queue.length > 0 ? `Sync, ${st.queue.length} waiting` : undefined} onClick={() => setTab(k)}>
            <span className="ico" aria-hidden="true" />{l}{k === 'sync' && st.queue.length > 0 ? <i>{st.queue.length}</i> : null}
          </button>
        ))}
      </nav>
    </div>
  )
}
