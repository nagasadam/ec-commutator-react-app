import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useStore } from './lib/store.jsx'
import { useToast } from './toast.jsx'
import { SyncEngine, WARN_BYTES, sizeOf } from './lib/sync.js'
import { authMessage, configFromEnv, createFirebase } from './lib/firebase.js'

const Ctx = createContext({ configured: false, user: null, status: 'off' })
export const useCloud = () => useContext(Ctx)

// Cloud is optional: with no VITE_FIREBASE_* settings the app is purely local.
export function CloudProvider({ children, env = import.meta.env || {} }) {
  const cfg = configFromEnv(env)
  const { rev, getS, replace, b } = useStore()
  const toast = useToast()
  const [ready, setReady] = useState(!cfg)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(cfg ? 'idle' : 'off')
  const [choice, setChoice] = useState(null)
  const [skip, setSkip] = useState(false) // "use on this device only"
  const fb = useRef(null)
  const eng = useRef(null)

  useEffect(() => {
    if (!cfg) return undefined
    let off = () => {}
    createFirebase(cfg)
      .then((x) => {
        fb.current = x
        off = x.onUser((u) => {
          setUser(u)
          setReady(true)
        })
      })
      .catch((e) => {
        setStatus('error')
        setReady(true)
        toast.push('Cloud unavailable: ' + (e?.message || e), 'err', { key: 'cloud-init' })
      })
    return () => off()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !fb.current) return undefined
    const e = new SyncEngine({
      backend: fb.current.backend,
      storage: localStorage,
      getState: getS,
      setState: replace,
      onStatus: (s, x) => {
        setStatus(s)
        if (s === 'choice') setChoice(x.ids)
        else setChoice(null)
        if (s === 'saved' && x?.pushed) toast.push('Saved to cloud', 'ok', { key: 'cloud', ms: 1600 })
        if (s === 'error') toast.push('Cloud save failed: ' + (x?.message || 'unknown error') + ' Your data is safe on this device.', 'err', { key: 'cloud-err' })
        if (s === 'offline') toast.push('Offline. Changes are kept on this device and will sync when you are back online.', 'info', { key: 'cloud-off', ms: 4000 })
      },
      onEvent: (ev) => {
        if (ev.type === 'merged') toast.push(`Merged with changes from another device (${ev.conflicts} entr${ev.conflicts === 1 ? 'y' : 'ies'} changed on both; cloud version kept).`, 'info', { ms: 6000 })
        if (ev.type === 'pulled') toast.push('Updated from the cloud', 'info')
      },
    })
    eng.current = e
    e.start()
    return () => {
      e.stop()
      eng.current = null
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // local edit -> debounced push
  useEffect(() => {
    if (rev) eng.current?.schedule()
  }, [rev])

  // flush on tab hide, warn on close while unsaved (notes §12)
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && eng.current?.flush()
    const unload = (ev) => {
      if (eng.current?.dirty && user) {
        ev.preventDefault()
        ev.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('beforeunload', unload)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('beforeunload', unload)
    }
  }, [user])

  const signIn = useCallback(async (email, pw) => {
    try {
      await fb.current.signIn(email, pw)
      return ''
    } catch (e) {
      return authMessage(e)
    }
  }, [])
  const signOut = useCallback(async () => {
    await eng.current?.flush() // never leave pending changes behind
    await fb.current?.signOut()
    setStatus('idle')
  }, [])

  const value = {
    configured: !!cfg,
    ready,
    user,
    status,
    choice,
    skip,
    setSkip,
    signIn,
    signOut,
    resolveChoice: (how) => eng.current?.resolveChoice(how),
    syncNow: () => eng.current?.flush(),
    sizeWarn: sizeOf(b) > WARN_BYTES,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
