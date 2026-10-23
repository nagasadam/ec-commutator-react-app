// Cloud sync engine. It knows nothing about Firebase: it talks to a `backend` with
//   list()                      -> [{ id, rev, data }]   data is a JSON string, or null for a deleted business
//   put(id, data, expectedRev)  -> { rev }               throws { code: 'conflict' } if the stored rev differs
//   subscribe(cb)               -> unsubscribe           cb() is called when something changes remotely
// Safety rules (notes §12): never overwrite newer remote data, merge instead; never
// drop local entries silently; a failed push leaves local data untouched and retries.
import { ARRAYS } from './model.js'

export const BASE_KEY = 'booksmith10base'
export const MAX_BYTES = 900_000 // Firestore documents are capped at 1 MiB
export const WARN_BYTES = 700_000

const json = (x) => JSON.stringify(x)
const isConflict = (e) => e?.code === 'conflict'
const SCALARS = (b) => Object.keys(b).filter((k) => !ARRAYS.includes(k))

export const sizeOf = (b) => json(b).length

// A business nobody has typed anything into (safe to drop when the cloud already has data).
export function isPristine(b) {
  if (b.demo) return false
  if (b.cashOpen || b.gpayOpen) return false
  return ARRAYS.every((k) => k === 'items' || !b[k].length) && b.items.every((i) => !i.open && !i.rate)
}

// Three-way merge of one business. base = last synced copy (may be null), local = this
// device, remote = cloud. A side that changed a thing wins over a side that did not; when
// both changed the same record the cloud copy is kept and counted in `conflicts`.
export function mergeBiz(base, local, remote) {
  const out = {}
  let conflicts = 0
  for (const k of new Set([...SCALARS(local), ...SCALARS(remote)])) {
    const bv = base?.[k]
    out[k] = json(remote[k]) !== json(bv) ? remote[k] : local[k]
    if (json(local[k]) !== json(bv) && json(remote[k]) !== json(bv) && json(local[k]) !== json(remote[k])) conflicts++
  }
  for (const k of ARRAYS) {
    const B = new Map((base?.[k] || []).map((x) => [x.id, json(x)]))
    const L = new Map((local[k] || []).map((x) => [x.id, x]))
    const R = new Map((remote[k] || []).map((x) => [x.id, x]))
    const list = []
    for (const [id, r] of R) {
      const l = L.get(id)
      const bs = B.get(id)
      if (!l) {
        // gone locally: honour the delete unless the cloud changed it since
        if (bs !== undefined && json(r) === bs) continue
        list.push(r)
      } else if (json(l) === json(r)) list.push(r)
      else if (bs === undefined) list.push(r) // same id added on both sides: keep cloud
      else if (json(r) === bs) list.push(l) // only local edited
      else {
        if (json(l) !== bs) conflicts++
        list.push(r)
      }
    }
    for (const [id, l] of L) if (!R.has(id) && !B.has(id)) list.push(l) // added locally
    out[k] = list
  }
  return { biz: out, conflicts }
}

export class SyncEngine {
  constructor({ backend, storage, getState, setState, onStatus = () => {}, onEvent = () => {}, delay = 1200, timers = globalThis }) {
    Object.assign(this, { backend, storage, getState, setState, onStatus, onEvent, delay, timers })
    this.base = this.#loadBase()
    this.status = 'idle'
    this.timer = null
    this.running = false
    this.again = false
    this.unsub = null
    this.choice = null
  }

  #loadBase() {
    try {
      return JSON.parse(this.storage.getItem(BASE_KEY)) || null
    } catch {
      return null
    }
  }
  #saveBase() {
    try {
      this.storage.setItem(BASE_KEY, json(this.base))
    } catch {
      /* base is only an optimisation for merging; sync still works without it */
    }
  }
  #set(status, extra) {
    this.status = status
    this.onStatus(status, extra)
  }

  start() {
    this.unsub = this.backend.subscribe(() => this.schedule(300))
    return this.sync()
  }
  stop() {
    this.unsub?.()
    this.unsub = null
    this.timers.clearTimeout(this.timer)
    this.timer = null
  }
  // Call after every local change.
  schedule(ms = this.delay) {
    this.timers.clearTimeout(this.timer)
    this.timer = this.timers.setTimeout(() => this.sync(), ms)
  }
  flush() {
    this.timers.clearTimeout(this.timer)
    return this.sync()
  }

  // Has this device got changes the cloud has not seen?
  get dirty() {
    if (!this.base) return true
    const S = this.getState()
    return S.biz.some((b) => this.base[b.id]?.snap !== json(b)) || Object.keys(this.base).some((id) => !this.base[id].deleted && !S.biz.some((b) => b.id === id))
  }

  async resolveChoice(how) {
    if (!this.choice) return
    const ids = this.choice
    this.choice = null
    if (how === 'discard') {
      this.setState((S) => {
        const biz = S.biz.filter((b) => !ids.includes(b.id))
        return { biz, cur: biz.some((b) => b.id === S.cur) ? S.cur : biz[0]?.id }
      })
    }
    this.base ||= {}
    this.firstDone = true
    return this.sync()
  }

  async sync(depth = 0) {
    if (this.choice) return
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    this.#set('syncing')
    try {
      const remote = await this.backend.list()
      const rmap = new Map(remote.map((r) => [r.id, r]))
      const first = !this.base
      this.base ||= {}

      if (first && !this.firstDone) {
        // First sync on this device: local entries that the cloud has never seen need a decision.
        const S = this.getState()
        const localOnly = S.biz.filter((b) => !rmap.has(b.id) && !isPristine(b)).map((b) => b.id)
        if (remote.some((r) => r.data) && localOnly.length) {
          this.choice = localOnly
          this.base = null
          this.#set('choice', { ids: localOnly })
          return
        }
        if (remote.some((r) => r.data)) this.setState((S2) => ({ ...S2, biz: S2.biz.filter((b) => rmap.has(b.id) || !isPristine(b)) }))
      }

      let conflicts = 0
      let pulled = 0
      // ---- pull (synchronous from here to apply: no awaits, so no local edit can slip in) ----
      const S = this.getState()
      const biz = [...S.biz]
      for (const r of remote) {
        const known = this.base[r.id]
        if (known && known.rev === r.rev) continue
        const i = biz.findIndex((b) => b.id === r.id)
        if (r.data == null) {
          if (i >= 0 && known && known.snap === json(biz[i])) biz.splice(i, 1)
          if (i >= 0 && !(known && known.snap === json(biz[i]))) continue // edited locally after a remote delete: re-create on push
          this.base[r.id] = { rev: r.rev, snap: null, deleted: true }
          pulled++
          continue
        }
        const rb = JSON.parse(r.data)
        if (i < 0) {
          if (known && !known.deleted) continue // deleted on this device; handled in push
          biz.push(rb)
          this.base[r.id] = { rev: r.rev, snap: json(rb) }
        } else {
          const m = mergeBiz(known?.snap ? JSON.parse(known.snap) : null, biz[i], rb)
          biz[i] = m.biz
          conflicts += m.conflicts
          // base records what the cloud holds; merged-in local work is pushed below
          this.base[r.id] = { rev: r.rev, snap: json(rb) }
        }
        pulled++
      }
      if (pulled || biz.length !== S.biz.length) this.setState({ ...S, biz, cur: biz.some((b) => b.id === S.cur) ? S.cur : biz[0]?.id })

      // ---- push ----
      const cur = this.getState()
      let pushed = 0
      let conflict = false
      for (const b of cur.biz) {
        const snap = json(b)
        if (this.base[b.id]?.snap === snap) continue
        if (snap.length > MAX_BYTES) throw Object.assign(new Error(`"${b.name}" is too large to sync (${Math.round(snap.length / 1000)} KB). Export a backup and start a fresh business for the new year.`), { code: 'too-large' })
        try {
          const res = await this.backend.put(b.id, snap, rmap.get(b.id)?.rev || this.base[b.id]?.rev || 0)
          this.base[b.id] = { rev: res.rev, snap }
          rmap.set(b.id, { id: b.id, rev: res.rev })
          pushed++
        } catch (e) {
          if (isConflict(e)) conflict = true
          else throw e
        }
      }
      for (const id of Object.keys(this.base)) {
        if (this.base[id].deleted || cur.biz.some((b) => b.id === id)) continue
        try {
          const res = await this.backend.put(id, null, this.base[id].rev)
          this.base[id] = { rev: res.rev, snap: null, deleted: true }
          pushed++
        } catch (e) {
          if (isConflict(e)) conflict = true
          else throw e
        }
      }
      this.#saveBase()
      if (conflicts) this.onEvent({ type: 'merged', conflicts })
      else if (pulled) this.onEvent({ type: 'pulled', count: pulled })
      if (conflict && depth < 3) {
        this.running = false
        return this.sync(depth + 1)
      }
      this.#set(conflict ? 'error' : 'saved', { pushed })
    } catch (e) {
      const offline = e?.code === 'unavailable' || e?.name === 'TypeError' || (typeof navigator !== 'undefined' && navigator.onLine === false)
      this.#set(offline ? 'offline' : 'error', { message: e?.message || String(e), code: e?.code })
      if (offline) this.schedule(15000)
    } finally {
      this.running = false
      if (this.again) {
        this.again = false
        this.schedule(50)
      }
    }
  }
}
