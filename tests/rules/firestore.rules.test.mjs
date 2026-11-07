// Firestore security rules, run against the Firebase emulator: npm run test:rules
// (the script starts the emulator; in CI it runs after the unit tests).
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const BIZ = 'biz1'
let env
const as = (email) => env.authenticatedContext(email.replace(/\W/g, '_'), { email }).firestore()
const scan = (over = {}) => ({ biz: BIZ, data: '{"id":"s1"}', status: 'waiting', by: 'floor@x.com', at: '2026-11-07T00:00:00Z', ...over })

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ec-rules', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } })
})
test.after(async () => env?.cleanup())
test.beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'allow/boss@x.com'), {})
    await setDoc(doc(db, 'scanallow/floor@x.com'), { biz: BIZ })
    await setDoc(doc(db, 'scanallow/nobiz@x.com'), {})
    await setDoc(doc(db, 'rec/r1'), { rev: 1, data: '{}', by: 'boss@x.com', at: 'x' })
    await setDoc(doc(db, 'scans/mine'), scan({ by: 'floor@x.com' }))
    await setDoc(doc(db, 'scans/theirs'), scan({ by: 'other@x.com' }))
    await setDoc(doc(db, 'scanmeta/' + BIZ), { data: '{}', at: 'x' })
    await setDoc(doc(db, 'scanmeta/otherbiz'), { data: '{}', at: 'x' })
  })
})

test('signed-out visitors can do nothing', async () => {
  const db = env.unauthenticatedContext().firestore()
  await assertFails(getDoc(doc(db, 'rec/r1')))
  await assertFails(setDoc(doc(db, 'scans/x'), scan()))
  await assertFails(getDoc(doc(db, 'scanmeta/' + BIZ)))
})

test('office account (in /allow) reads and writes the business data, but never deletes', async () => {
  const db = as('boss@x.com')
  await assertSucceeds(getDoc(doc(db, 'rec/r1')))
  await assertSucceeds(setDoc(doc(db, 'rec/r1'), { rev: 2, data: '{}', by: 'boss@x.com', at: 'y' }))
  await assertFails(setDoc(doc(db, 'rec/r1'), { rev: 3, data: '{}', by: 'boss@x.com', at: 'y', extra: 1 }))
  await assertFails(deleteDoc(doc(db, 'rec/r1')))
})

test('a signed-in stranger (in neither list) gets nothing', async () => {
  const db = as('stranger@x.com')
  await assertFails(getDoc(doc(db, 'rec/r1')))
  await assertFails(getDoc(doc(db, 'scans/mine')))
  await assertFails(setDoc(doc(db, 'scans/x'), scan({ by: 'stranger@x.com' })))
  await assertFails(getDoc(doc(db, 'scanmeta/' + BIZ)))
})

test('scanner: adds a waiting scan for its own business only', async () => {
  const db = as('floor@x.com')
  await assertSucceeds(setDoc(doc(db, 'scans/new1'), scan()))
  await assertFails(setDoc(doc(db, 'scans/new2'), scan({ biz: 'otherbiz' })))
  await assertFails(setDoc(doc(db, 'scans/new3'), scan({ by: 'other@x.com' })))
  await assertFails(setDoc(doc(db, 'scans/new4'), scan({ status: 'applied' })))
  await assertFails(setDoc(doc(db, 'scans/new5'), { ...scan(), extra: 1 }))
  await assertFails(setDoc(doc(db, 'scans/new6'), scan({ data: 'x'.repeat(5000) })))
})

test('scanner: sees only its own scans and its own business scan settings', async () => {
  const db = as('floor@x.com')
  await assertSucceeds(getDoc(doc(db, 'scans/mine')))
  await assertFails(getDoc(doc(db, 'scans/theirs')))
  await assertSucceeds(getDoc(doc(db, 'scanmeta/' + BIZ)))
  await assertFails(getDoc(doc(db, 'scanmeta/otherbiz')))
  await assertFails(setDoc(doc(db, 'scanmeta/' + BIZ), { data: '{}', at: 'y' }))
})

test('scanner: never touches the business data, applied scans or the allow lists', async () => {
  const db = as('floor@x.com')
  await assertFails(getDoc(doc(db, 'rec/r1')))
  await assertFails(setDoc(doc(db, 'rec/r1'), { rev: 2, data: '{}', by: 'x', at: 'y' }))
  await assertFails(updateDoc(doc(db, 'scans/mine'), { status: 'applied' }))
  await assertFails(deleteDoc(doc(db, 'scans/mine')))
  await assertFails(getDoc(doc(db, 'allow/boss@x.com')))
  await assertFails(setDoc(doc(db, 'scanallow/floor@x.com'), { biz: 'otherbiz', by: 'floor@x.com', at: 'x' }))
  await assertSucceeds(getDoc(doc(db, 'scanallow/floor@x.com')))
})

test('a scanallow entry without biz is refused', async () => {
  const db = as('nobiz@x.com')
  await assertFails(setDoc(doc(db, 'scans/n1'), scan({ by: 'nobiz@x.com' })))
  await assertFails(getDoc(doc(db, 'scanmeta/' + BIZ)))
})

test('office account applies a scan (status, note, done only)', async () => {
  const db = as('boss@x.com')
  await assertSucceeds(updateDoc(doc(db, 'scans/mine'), { status: 'applied', note: '', done: '2026-11-07' }))
  await assertFails(updateDoc(doc(db, 'scans/mine'), { data: '{"id":"changed"}' }))
  await assertSucceeds(getDoc(doc(db, 'scans/theirs')))
  await assertSucceeds(setDoc(doc(db, 'scanmeta/' + BIZ), { data: '{}', at: 'y' }))
})

test('office account manages shop-floor people; nobody else can', async () => {
  const boss = as('boss@x.com')
  const entry = { biz: BIZ, by: 'boss@x.com', at: '2026-11-07T00:00:00Z' }
  await assertSucceeds(setDoc(doc(boss, 'scanallow/new@x.com'), entry))
  await assertSucceeds(getDoc(doc(boss, 'scanallow/floor@x.com')))
  await assertFails(setDoc(doc(boss, 'scanallow/New@x.com'), entry)) // id must be lower case
  await assertFails(setDoc(doc(boss, 'scanallow/odd@x.com'), { ...entry, extra: 1 }))
  await assertFails(setDoc(doc(boss, 'scanallow/odd@x.com'), { ...entry, biz: 7 }))
  await assertFails(setDoc(doc(boss, 'allow/new@x.com'), {})) // the main-app list stays console-only
  await assertSucceeds(deleteDoc(doc(boss, 'scanallow/new@x.com')))
  const floor = as('floor@x.com')
  await assertFails(setDoc(doc(floor, 'scanallow/friend@x.com'), entry))
  await assertFails(deleteDoc(doc(floor, 'scanallow/floor@x.com')))
  await assertFails(getDoc(doc(floor, 'scanallow/nobiz@x.com')))
  await assertFails(setDoc(doc(as('stranger@x.com'), 'scanallow/stranger@x.com'), entry))
})
