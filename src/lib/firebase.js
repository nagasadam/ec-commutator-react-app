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
  const partsCol = () => sdk.collection(db, 'recparts')

  // One Firestore document holds at most 1 MiB. A business up to SPLIT_AT characters is one document in `rec`
  // (as it always was). A bigger one is cut into CHUNK-sized pieces stored in `recparts` ("<id>.<n>"), and its
  // `rec` document holds only a small marker. All pieces and the marker are written in one transaction.
  const SPLIT_AT = 600_000
  const CHUNK = 250_000 // characters: at most 3 bytes each in UTF-8, so a chunk stays under 1 MiB
  const marker = (data) => {
    try {
      const m = JSON.parse(data)
      return m && typeof m === 'object' && Number.isInteger(m.__split) ? m : null
    } catch {
      return null
    }
  }

  const backend = {
    async list() {
      for (let attempt = 0; attempt < 3; attempt++) {
        const snap = await sdk.getDocs(col())
        const rows = snap.docs.map((d) => ({ id: d.id, rev: d.data().rev || 0, data: d.data().data ?? null }))
        const split = rows.filter((r) => r.data && marker(r.data))
        if (!split.length) return rows
        const parts = new Map((await sdk.getDocs(partsCol())).docs.map((d) => [d.id, d.data()]))
        let ok = true
        for (const r of split) {
          const n = marker(r.data).__split
          const pieces = []
          for (let i = 0; i < n; i++) {
            const p = parts.get(r.id + '.' + i)
            if (!p || p.rev !== r.rev) ok = false
            else pieces.push(p.data)
          }
          if (ok) r.data = pieces.join('')
        }
        if (ok) return rows
        // the two reads straddled a write: read again
      }
      throw Object.assign(new Error('Cloud data was changing while it was read. Retrying shortly.'), { code: 'unavailable' })
    },
    async put(id, data, expectedRev) {
      const ref = sdk.doc(db, 'rec', id)
      const by = auth.currentUser?.email || ''
      return sdk.runTransaction(db, async (tx) => {
        const s = await tx.get(ref)
        const cur = s.exists() ? s.data().rev || 0 : 0
        if (cur !== expectedRev) throw Object.assign(new Error('changed elsewhere'), { code: 'conflict' })
        const at = new Date().toISOString()
        const rev = cur + 1
        if (data == null || data.length <= SPLIT_AT) {
          tx.set(ref, { rev, data, by, at })
          return { rev }
        }
        const n = Math.ceil(data.length / CHUNK)
        for (let i = 0; i < n; i++) tx.set(sdk.doc(db, 'recparts', id + '.' + i), { rev, data: data.slice(i * CHUNK, (i + 1) * CHUNK), at })
        tx.set(ref, { rev, data: JSON.stringify({ __split: n }), by, at })
        return { rev }
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

  // Shop-floor scans (see process.js). The phone app appends scan documents; the main app reads them, applies
  // them to the business data and marks them. `scanmeta/<bizId>` is what the main app tells the phone (vendors, open lots,
  // the approval switch). Scans never edit the business data directly, so a phone can never overwrite the main app's data.
  const scans = {
    async add(bizId, scan) {
      const by = auth.currentUser?.email || ''
      await sdk.setDoc(sdk.doc(db, 'scans', scan.id), { biz: bizId, data: JSON.stringify(scan), status: 'waiting', by, at: new Date().toISOString() })
    },
    // mine: only this person's scans (what a shop-floor account is allowed to read)
    async list(bizId, mine = false) {
      const q = mine
        ? sdk.query(sdk.collection(db, 'scans'), sdk.where('biz', '==', bizId), sdk.where('by', '==', auth.currentUser?.email || ''))
        : sdk.query(sdk.collection(db, 'scans'), sdk.where('biz', '==', bizId))
      const snap = await sdk.getDocs(q)
      return snap.docs.map((d) => {
        const x = d.data()
        let scan = null
        try { scan = JSON.parse(x.data) } catch { /* shown as a problem */ }
        return { id: d.id, scan, status: x.status || 'waiting', note: x.note || '', by: x.by || '', at: x.at || '' }
      })
    },
    async mark(id, status, note = '') {
      await sdk.updateDoc(sdk.doc(db, 'scans', id), { status, note, done: new Date().toISOString() })
    },
    subscribe(bizId, cb) {
      return sdk.onSnapshot(sdk.query(sdk.collection(db, 'scans'), sdk.where('biz', '==', bizId)), () => cb())
    },
    async putMeta(bizId, meta) {
      await sdk.setDoc(sdk.doc(db, 'scanmeta', bizId), { data: JSON.stringify(meta), at: new Date().toISOString() })
    },
    async getMeta(bizId) {
      const s = await sdk.getDoc(sdk.doc(db, 'scanmeta', bizId))
      return s.exists() ? JSON.parse(s.data().data) : null
    },
  }

  // Shop-floor people allowed to use the phone app for one business (office accounts manage the list).
  const scanners = {
    async list(bizId) {
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'scanallow'), sdk.where('biz', '==', bizId)))
      return snap.docs.map((d) => ({ email: d.id, by: d.data().by || '', at: d.data().at || '' })).sort((a, b) => a.email.localeCompare(b.email))
    },
    async add(bizId, email) {
      const id = String(email).trim().toLowerCase()
      await sdk.setDoc(sdk.doc(db, 'scanallow', id), { biz: bizId, by: auth.currentUser?.email || '', at: new Date().toISOString() })
      return id
    },
    async remove(email) {
      await sdk.deleteDoc(sdk.doc(db, 'scanallow', String(email).trim().toLowerCase()))
    },
  }

  return {
    backend,
    scans,
    scanners,
    // Is this email listed in /allow (the main app)? Scan-only accounts are not. The rules let a person read only their own document.
    async hasAccess(email) {
      const s = await sdk.getDoc(sdk.doc(db, 'allow', String(email).toLowerCase()))
      return s.exists()
    },
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
