// Firebase adapter: email + password sign-in and a Firestore-backed `backend` for SyncEngine.
// The SDK is loaded lazily (and can be injected for tests), so the app runs without Firebase
// installed or configured.
export const configFromEnv = (env = {}) => {
  const c = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  return c.apiKey && c.projectId && c.appId ? c : null
}

async function loadSdk() {
  const [app, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  return { ...app, ...auth, ...fs }
}

export async function createFirebase(cfg, sdk) {
  sdk ||= await loadSdk()
  const app = sdk.initializeApp(cfg)
  const auth = sdk.getAuth(app)
  const db = sdk.getFirestore(app)
  const col = () => sdk.collection(db, 'rec')

  const backend = {
    async list() {
      const snap = await sdk.getDocs(col())
      return snap.docs.map((d) => ({ id: d.id, rev: d.data().rev || 0, data: d.data().data ?? null }))
    },
    async put(id, data, expectedRev) {
      const ref = sdk.doc(db, 'rec', id)
      return sdk.runTransaction(db, async (tx) => {
        const s = await tx.get(ref)
        const cur = s.exists() ? s.data().rev || 0 : 0
        if (cur !== expectedRev) throw Object.assign(new Error('changed elsewhere'), { code: 'conflict' })
        tx.set(ref, { rev: cur + 1, data, by: auth.currentUser?.email || '', at: new Date().toISOString() })
        return { rev: cur + 1 }
      })
    },
    subscribe(cb) {
      let first = true
      return sdk.onSnapshot(col(), () => {
        if (first) first = false // the initial snapshot is just the current state
        else cb()
      })
    },
  }

  return {
    backend,
    signIn: (email, password) => sdk.signInWithEmailAndPassword(auth, email, password),
    signOut: () => sdk.signOut(auth),
    onUser: (cb) => sdk.onAuthStateChanged(auth, (u) => cb(u ? { email: u.email, uid: u.uid } : null)),
  }
}

export const authMessage = (e) => {
  const c = e?.code || ''
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'Wrong email or password.'
  if (/too-many-requests/.test(c)) return 'Too many attempts. Wait a few minutes and try again.'
  if (/network/.test(c)) return 'No connection. Check your internet and retry.'
  return e?.message || 'Sign-in failed.'
}
