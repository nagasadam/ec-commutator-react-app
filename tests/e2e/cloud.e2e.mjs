// Sign-in and "no access" screens of the main app, with a fake Firebase injected before the app starts.
// Usage: E2E_URL=<main app address> node --test tests/e2e/cloud.e2e.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_MODULE || 'playwright')
const target = process.env.E2E_URL || process.argv.find((a) => /^(https?:|file:)/.test(a))
assert.ok(target, 'set E2E_URL to the app address')

let browser
test.before(async () => {
  browser = await chromium.launch()
})
test.after(async () => browser.close())

// allow: true (listed in /allow) | false (a scan-only account) | 'error' (could not check)
async function open(allow, signedInAs = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } })
  const p = await ctx.newPage()
  p.errs = []
  p.on('pageerror', (e) => p.errs.push(e.message))
  await p.addInitScript(([allow, signedInAs]) => {
    const fb = { user: signedInAs ? { email: signedInAs, uid: 'u1' } : null, allow, listeners: [] }
    window.__fb = fb
    const emit = () => fb.listeners.forEach((cb) => cb(fb.user ? { email: fb.user.email, uid: fb.user.uid } : null))
    const col = { docs: [] }
    const store = new Map()
    fb.store = store
    window.__EC_TEST_CLOUD = {
      env: { VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: 'a' },
      sdk: {
        initializeApp: () => ({}),
        getAuth: () => ({ get currentUser() { return fb.user } }),
        getFirestore: () => ({}),
        collection: (_db, n) => n,
        doc: (_db, ...path) => path.join('/'),
        query: (c, ...w) => ({ c, w }),
        where: (f, _o, v) => ({ f, v }),
        getDocs: async (q) => {
          if (q.c !== 'scanallow') return col
          return { docs: [...store].filter(([k, v]) => k.startsWith('scanallow/') && q.w.every((x) => v[x.f] === x.v)).map(([k, v]) => ({ id: k.slice(10), data: () => v })) }
        },
        getDoc: async () => {
          if (fb.allow === 'error') throw new Error('offline')
          return { exists: () => fb.allow === true, data: () => ({}) }
        },
        setDoc: async (k, v) => void store.set(k, v),
        deleteDoc: async (k) => void store.delete(k),
        updateDoc: async () => {},
        onSnapshot: () => () => {},
        runTransaction: async (_db, fn) => fn({ get: async () => ({ exists: () => false, data: () => ({}) }), set() {} }),
        signInWithEmailAndPassword: async (_a, email, pw) => {
          if (pw === 'bad') throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' })
          fb.user = { email, uid: 'u1' }
          emit()
        },
        signOut: async () => {
          fb.user = null
          emit()
        },
        onAuthStateChanged: (_a, cb) => {
          fb.listeners.push(cb)
          setTimeout(() => cb(fb.user ? { email: fb.user.email, uid: fb.user.uid } : null), 0)
          return () => {}
        },
      },
    }
  }, [allow, signedInAs])
  await p.goto(target)
  return p
}
const signIn = async (p, email, pw = 'secret1') => {
  await p.getByLabel('Email').fill(email)
  await p.getByLabel('Password').fill(pw)
  await p.click('button:text-is("Sign in")')
}

test('sign-in: signed-out people see the form; a wrong password says so', async () => {
  const p = await open(true)
  await p.getByLabel('Email').waitFor()
  await signIn(p, 'boss@x.com', 'bad')
  assert.match(await p.getByRole('alert').innerText(), /Wrong email or password/)
  assert.deepEqual(p.errs, [])
})

test('no access: a scan-only account is told so, sees nothing of the business, and can sign out', async () => {
  const p = await open(false)
  await p.getByLabel('Email').waitFor()
  await signIn(p, 'floor@x.com')
  await p.getByRole('heading', { name: 'No access to this app' }).waitFor()
  const text = await p.locator('body').innerText()
  assert.match(text, /floor@x\.com is not allowed to open this app/)
  assert.doesNotMatch(text, /books/i)
  assert.equal(await p.locator('nav').count(), 0) // no app tabs behind it
  await p.click('button:text-is("Sign out")')
  await p.getByLabel('Email').waitFor()
  assert.deepEqual(p.errs, [])
})

test('no access: when the check cannot run, "Try again" checks once more', async () => {
  const p = await open('error', 'floor@x.com')
  await p.getByRole('heading', { name: 'Could not check your access' }).waitFor()
  await p.evaluate(() => (window.__fb.allow = false))
  await p.click('button:text-is("Try again")')
  await p.getByRole('heading', { name: 'No access to this app' }).waitFor()
  assert.deepEqual(p.errs, [])
})

test('an office account (listed in /allow) gets into the app', async () => {
  const p = await open(true, 'boss@x.com')
  await p.locator('nav').first().waitFor()
  assert.equal(await p.getByRole('heading', { name: 'No access to this app' }).count(), 0)
  assert.deepEqual(p.errs, [])
})

test('office adds and removes shop-floor people from Process scan, with the business id filled in', async () => {
  const p = await open(true, 'boss@x.com')
  await p.locator('nav').first().waitFor()
  await p.getByRole('button', { name: /More/ }).first().click()
  await p.getByRole('menuitem', { name: /Process scan/ }).click()
  await p.getByRole('heading', { name: 'Shop-floor phones' }).waitFor()
  await p.getByLabel('Shop-floor email').fill('Floor@X.com')
  await p.click('button:text-is("Add")')
  await p.getByText('floor@x.com').waitFor()
  const saved = (await p.evaluate(() => [...window.__fb.store])).filter(([k]) => k.startsWith('scanallow/'))
  assert.equal(saved.length, 1)
  assert.equal(saved[0][0], 'scanallow/floor@x.com')
  assert.ok(saved[0][1].biz && saved[0][1].biz.length >= 3, 'business id was written')
  await p.click('button:text-is("Remove")')
  await p.click('.modal button:text-is("Remove"), [role="dialog"] button:text-is("Remove")')
  await p.getByText('No shop-floor people added yet.').waitFor()
  assert.equal(await p.evaluate(() => [...window.__fb.store.keys()].filter((k) => k.startsWith('scanallow/')).length), 0)
  assert.deepEqual(p.errs, [])
})
