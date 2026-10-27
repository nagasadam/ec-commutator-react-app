import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fixBiz, mkBiz } from './model.js'
import { demoBiz } from './seed.js'
import { useToast } from '../toast.jsx'

export const KEY = 'booksmith10'
export const PEND_KEY = 'booksmith10pend'

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s?.biz?.length) {
      s.biz.forEach(fixBiz)
      if (!s.biz.some((b) => b.id === s.cur)) s.cur = s.biz[0].id
      return s
    }
  } catch {
    /* fall through to a fresh state */
  }
  // The hosted artifact sets this flag so first-time visitors land on the sample business.
  const b = typeof window !== 'undefined' && window.__EC_SEED_DEMO__ ? demoBiz() : mkBiz('My Business')
  return { biz: [b], cur: b.id }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const toast = useToast()
  const [S, setS] = useState(load)
  const Sref = useRef(S)
  const silent = useRef(false) // set while applying cloud data, so it does not trigger a "Saved" toast
  const [saveErr, setSaveErr] = useState('')
  const [rev, setRev] = useState(0) // bumps on every local edit (drives cloud sync scheduling)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      // A brand-new business gets a random id. Persist it right away: if it only reached storage on the
      // first edit, every reload before that minted a new id, which the cloud sync then uploaded as a new
      // business (with the old one deleted) and announced with a "Saved to cloud" toast.
      try {
        if (localStorage.getItem(KEY) == null) localStorage.setItem(KEY, JSON.stringify(S))
      } catch {
        /* storage unavailable: the save error shows on the first edit */
      }
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(S))
      setSaveErr('')
      if (!silent.current) toast.push('Saved', 'ok', { key: 'saved', ms: 1400 })
    } catch (e) {
      const msg = 'Not saved: this device refused the write (' + (e?.name || 'storage error') + '). Free some space or export a backup.'
      setSaveErr(msg)
      toast.push(msg, 'err', { key: 'save-fail' })
    }
    silent.current = false
  }, [S]) // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronous: Sref is always the latest state, so cloud merges never see a stale copy.
  // `{ quiet: true }` skips the "Saved" toast (used for switching the selected business).
  const upd = useCallback((fn, opts) => {
    if (opts?.quiet) silent.current = true
    const n = structuredClone(Sref.current)
    fn(n)
    Sref.current = n
    setS(n)
    setRev((r) => r + 1)
  }, [])

  // Used by the sync engine: replace state without counting it as a user edit.
  const replace = useCallback((x) => {
    const n = typeof x === 'function' ? x(Sref.current) : x
    n.biz.forEach(fixBiz)
    silent.current = true
    Sref.current = n
    setS(n)
  }, [])

  const b = S.biz.find((x) => x.id === S.cur) || S.biz[0]
  const updB = useCallback((fn) => upd((s) => fn(s.biz.find((x) => x.id === s.cur) || s.biz[0])), [upd])

  const value = useMemo(() => ({ S, upd, b, updB, saveErr, rev, replace, getS: () => Sref.current }), [S, upd, b, updB, saveErr, rev, replace])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
