import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useStore } from './lib/store.jsx'
import { useCloud } from './cloud.jsx'
import { applyScan, openLots, bizTag, ensureProcessItems, TYPES, itemId } from './lib/process.js'
import { valuation } from './lib/calc.js'

// Receives scans from the Process Scan phone app (Firestore `scans`), applies them to the business data or leaves them
// waiting for approval, and tells the phone what it needs to know (vendors, open lots, the approval switch).
// Scans are applied from this app only, so the business data still has a single writer.
const Ctx = createContext({ rows: [], ready: false, refresh: () => {}, apply: () => {}, reject: () => {}, error: '' })
export const useScans = () => useContext(Ctx)

export function ScanProvider({ children }) {
  const { b, upd, getS } = useStore()
  const cloud = useCloud()
  const [rows, setRows] = useState([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const api = cloud.scans
  const live = !!(cloud.user && api && b?.id)

  const refresh = useCallback(async () => {
    if (!live) return []
    try {
      const r = (await api.list(b.id)).sort((x, y) => (x.scan?.at || x.at).localeCompare(y.scan?.at || y.at))
      setRows(r)
      setReady(true)
      setError('')
      return r
    } catch (e) {
      setError(e?.message || 'Could not read scans')
      return []
    }
  }, [live, api, b?.id])

  // put one scan into the business data (committing only when it applies cleanly), then mark it
  const applyOne = useCallback(
    async (row, force = false) => {
      let res
      upd((s) => {
        const biz = s.biz.find((x) => x.id === b.id)
        const probe = structuredClone(biz)
        res = row.scan ? applyScan(probe, row.scan, { force }) : { error: 'The scan could not be read.' }
        if (res.ok && !res.duplicate) applyScan(biz, row.scan, { force }) // commit
        else if (res.ok) ensureProcessItems(biz)
      })
      try {
        if (res.ok) await api.mark(row.id, 'applied')
        else await api.mark(row.id, 'problem', res.error)
      } catch (e) {
        setError(e?.message || 'Could not mark the scan')
      }
      return res
    },
    [upd, api, b?.id],
  )

  const apply = useCallback(
    async (row, force) => {
      await applyOne(row, force)
      await refresh()
    },
    [applyOne, refresh],
  )
  const reject = useCallback(
    async (row) => {
      try {
        await api.mark(row.id, 'rejected')
      } catch (e) {
        setError(e?.message || 'Could not reject the scan')
      }
      await refresh()
    },
    [api, refresh],
  )

  // watch for scans; with approval off, apply new ones as they arrive (this app has to be open for that)
  const auto = useCallback(
    async (list) => {
      if (busy.current) return
      busy.current = true
      try {
        const cur = getS().biz.find((x) => x.id === b.id)
        if (cur?.pscan?.approve !== false) return
        for (const r of list.filter((x) => x.status === 'waiting')) await applyOne(r)
        await refresh()
      } finally {
        busy.current = false
      }
    },
    [getS, b?.id, applyOne, refresh],
  )
  useEffect(() => {
    if (!live) {
      setRows([])
      setReady(false)
      return undefined
    }
    let off = () => {}
    refresh().then(auto)
    try {
      off = api.subscribe(b.id, () => refresh().then(auto))
    } catch (e) {
      setError(e?.message || 'Could not watch for scans')
    }
    return () => off()
  }, [live, b?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // tell the phone what the business data says (debounced; only when it changed)
  const lastMeta = useRef('')
  useEffect(() => {
    if (!live) return undefined
    const t = setTimeout(() => {
      const probe = structuredClone(b)
      ensureProcessItems(probe)
      const q = valuation(probe).qty
      const stock = {}
      for (const t of TYPES) for (const k of ['av', 'stk', 'mld']) stock[itemId(k, t.id)] = Math.round((q[itemId(k, t.id)] || 0) * 1000) / 1000
      const meta = { biz: b.id, name: b.name, tag: bizTag(b.id), approve: b.pscan?.approve !== false, vendors: b.sup.map((s) => ({ id: s.id, name: s.name })), lots: openLots(b), stock, rates: b.pscan?.rates || {} }
      const j = JSON.stringify(meta)
      if (j === lastMeta.current) return
      lastMeta.current = j
      api.putMeta(b.id, meta).catch(() => {
        lastMeta.current = ''
      })
    }, 1500)
    return () => clearTimeout(t)
  }, [live, b, api])

  return <Ctx.Provider value={{ rows, ready, refresh, apply, reject, error, live }}>{children}</Ctx.Provider>
}
