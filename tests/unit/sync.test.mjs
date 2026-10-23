import test from 'node:test'
import assert from 'node:assert/strict'
import { SyncEngine, mergeBiz, isPristine, MAX_BYTES } from '../../src/lib/sync.js'
import { mkBiz } from '../../src/lib/model.js'
import { demoBiz } from '../../src/lib/seed.js'
import { createFirebase, configFromEnv, authMessage } from '../../src/lib/firebase.js'

// ---- fakes ----
function fakeBackend() {
  const db = new Map()
  const subs = new Set()
  const be = {
    db,
    down: false,
    async list() {
      if (be.down) throw Object.assign(new Error('offline'), { code: 'unavailable' })
      return [...db].map(([id, v]) => ({ id, ...v }))
    },
    async put(id, data, exp) {
      if (be.down) throw Object.assign(new Error('offline'), { code: 'unavailable' })
      const cur = db.get(id)?.rev || 0
      if (cur !== exp) throw Object.assign(new Error('c'), { code: 'conflict' })
      db.set(id, { rev: cur + 1, data })
      subs.forEach((f) => f())
      return { rev: cur + 1 }
    },
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
  return be
}
const mem = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }
}
const noTimers = { setTimeout: () => 0, clearTimeout() {} }
function device(be, S0) {
  const st = { S: S0, status: '', events: [] }
  const eng = new SyncEngine({
    backend: be,
    storage: mem(),
    timers: noTimers,
    getState: () => st.S,
    setState: (x) => (st.S = typeof x === 'function' ? x(st.S) : x),
    onStatus: (s) => (st.status = s),
    onEvent: (e) => st.events.push(e),
  })
  return { st, eng }
}
const S1 = (b) => ({ biz: [b], cur: b.id })

test('first device pushes its business, second device pulls it', async () => {
  const be = fakeBackend()
  const a = device(be, S1(demoBiz()))
  await a.eng.sync()
  assert.equal(a.st.status, 'saved')
  assert.equal(be.db.size, 1)
  const b = device(be, S1(mkBiz('blank')))
  await b.eng.sync()
  assert.equal(b.st.S.biz.length, 1) // pristine blank dropped
  assert.equal(b.st.S.biz[0].name, 'E.C Commutators')
  assert.equal(b.st.S.biz[0].inv.length, 4)
})

test('edits on one device reach the other and nothing is lost', async () => {
  const be = fakeBackend()
  const a = device(be, S1(demoBiz()))
  await a.eng.sync()
  const b = device(be, S1(mkBiz('x')))
  await b.eng.sync()
  a.st.S.biz[0].exp.push({ id: 'ea', date: '2026-10-01', head: 'A', amt: 1, acct: 'cash' })
  b.st.S.biz[0].exp.push({ id: 'eb', date: '2026-10-01', head: 'B', amt: 2, acct: 'cash' })
  await a.eng.sync()
  await b.eng.sync() // sees remote change, merges, pushes
  await a.eng.sync()
  for (const d of [a, b]) assert.deepEqual(d.st.S.biz[0].exp.map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e4', 'e5', 'ea', 'eb'])
  assert.equal(be.db.values().next().value.rev, 3)
})

test('a delete on one device propagates and is not resurrected by a stale push', async () => {
  const be = fakeBackend()
  const a = device(be, S1(demoBiz()))
  await a.eng.sync()
  const b = device(be, S1(mkBiz('x')))
  await b.eng.sync()
  a.st.S.biz[0].exp = a.st.S.biz[0].exp.filter((e) => e.id !== 'e1')
  await a.eng.sync()
  await b.eng.sync()
  assert.ok(!b.st.S.biz[0].exp.some((e) => e.id === 'e1'))
})

test('deleting a whole business writes a tombstone and removes it on other devices', async () => {
  const be = fakeBackend()
  const keep = mkBiz('keep')
  const gone = mkBiz('gone')
  gone.cashOpen = 5
  const a = device(be, { biz: [keep, gone], cur: keep.id })
  await a.eng.sync()
  const b = device(be, S1(mkBiz('x')))
  await b.eng.sync()
  assert.equal(b.st.S.biz.length, 2)
  a.st.S.biz = a.st.S.biz.filter((x) => x.id !== gone.id)
  await a.eng.sync()
  assert.equal(be.db.get(gone.id).data, null)
  await b.eng.sync()
  assert.deepEqual(b.st.S.biz.map((x) => x.name), ['keep'])
})

test('offline: status is offline, local data untouched, next sync succeeds', async () => {
  const be = fakeBackend()
  const a = device(be, S1(demoBiz()))
  be.down = true
  await a.eng.sync()
  assert.equal(a.st.status, 'offline')
  assert.equal(a.st.S.biz[0].inv.length, 4)
  be.down = false
  await a.eng.sync()
  assert.equal(a.st.status, 'saved')
  assert.equal(be.db.size, 1)
})

test('stale rev conflict is retried and ends saved', async () => {
  const be = fakeBackend()
  const a = device(be, S1(demoBiz()))
  await a.eng.sync()
  a.st.S.biz[0].cashOpen = 1
  const realPut = be.put
  let first = true
  be.put = async (...x) => {
    if (first) {
      first = false
      be.db.get(a.st.S.biz[0].id).rev++ // someone else wrote in between
    }
    return realPut(...x)
  }
  await a.eng.sync()
  assert.equal(a.st.status, 'saved')
  assert.equal(JSON.parse(be.db.get(a.st.S.biz[0].id).data).cashOpen, 1)
})

test('first sign-in with unsynced local work asks; Add keeps it, Discard drops it', async () => {
  for (const how of ['add', 'discard']) {
    const be = fakeBackend()
    const seed = device(be, S1(demoBiz()))
    await seed.eng.sync()
    const mine = mkBiz('Mine')
    mine.cashOpen = 100
    const d = device(be, S1(mine))
    await d.eng.sync()
    assert.equal(d.st.status, 'choice')
    assert.equal(be.db.size, 1) // nothing uploaded yet
    await d.eng.resolveChoice(how)
    assert.equal(d.st.S.biz.some((b) => b.name === 'Mine'), how === 'add')
    assert.equal(be.db.size, how === 'add' ? 2 : 1)
  }
})

test('too-large business is refused, not truncated', async () => {
  const be = fakeBackend()
  const b = mkBiz('big')
  b.exp = [{ id: 'x', note: 'y'.repeat(MAX_BYTES) }]
  const a = device(be, S1(b))
  await a.eng.sync()
  assert.equal(a.st.status, 'error')
  assert.equal(be.db.size, 0)
  assert.equal(a.st.S.biz[0].exp.length, 1)
})

test('mergeBiz: both edited same record -> cloud wins and is counted', () => {
  const base = { id: 'a', name: 'n', exp: [{ id: '1', amt: 1 }], items: [], inv: [], banks: [], tx: [], pur: [], prod: [], cust: [], sup: [], sr: [], prr: [], rej: [], pp: [] }
  const local = { ...base, exp: [{ id: '1', amt: 2 }] }
  const remote = { ...base, exp: [{ id: '1', amt: 3 }] }
  const m = mergeBiz(base, local, remote)
  assert.equal(m.biz.exp[0].amt, 3)
  assert.equal(m.conflicts, 1)
  assert.equal(mergeBiz(base, local, base).biz.exp[0].amt, 2) // only local edited
})

test('isPristine', () => {
  assert.ok(isPristine(mkBiz('a')))
  assert.ok(!isPristine(demoBiz()))
  const b = mkBiz('a')
  b.cust.push({ id: 'c' })
  assert.ok(!isPristine(b))
})

test('firebase adapter: put is a transaction that enforces the revision', async () => {
  const store = new Map()
  const sdk = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { email: 'a@b.c' } }),
    getFirestore: () => ({}),
    collection: () => 'col',
    doc: (_d, _c, id) => id,
    getDocs: async () => ({ docs: [...store].map(([id, v]) => ({ id, data: () => v })) }),
    onSnapshot: (_c, cb) => (cb(), () => {}),
    runTransaction: async (_db, fn) =>
      fn({
        get: async (id) => ({ exists: () => store.has(id), data: () => store.get(id) }),
        set: (id, v) => store.set(id, v),
      }),
    signInWithEmailAndPassword: async () => ({}),
    signOut: async () => {},
    onAuthStateChanged: (_a, cb) => (cb({ email: 'a@b.c', uid: '1' }), () => {}),
  }
  const fb = await createFirebase({ apiKey: 'k' }, sdk)
  assert.deepEqual(await fb.backend.put('x', '{}', 0), { rev: 1 })
  await assert.rejects(fb.backend.put('x', '{}', 0), (e) => e.code === 'conflict')
  assert.deepEqual(await fb.backend.put('x', null, 1), { rev: 2 })
  const l = await fb.backend.list()
  assert.deepEqual(l, [{ id: 'x', rev: 2, data: null }])
  let user
  fb.onUser((u) => (user = u))
  assert.equal(user.email, 'a@b.c')
})

test('firebase config and auth messages', () => {
  assert.equal(configFromEnv({}), null)
  assert.ok(configFromEnv({ VITE_FIREBASE_API_KEY: 'a', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: 'i' }))
  assert.match(authMessage({ code: 'auth/invalid-credential' }), /Wrong email/)
  assert.match(authMessage({ code: 'auth/too-many-requests' }), /Too many/)
})
