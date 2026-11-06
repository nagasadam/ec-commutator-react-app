// Lets the Process Scan phone app open with no signal, once it has been opened online one time.
// Pages and the app's own files: network first, the saved copy when offline. Fonts: saved copy first, refreshed in the background.
// Firebase and other API calls are never touched here (the app queues scans on the phone when offline).
const CACHE = 'processscan-shell-v1'
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return
  if (!sameOrigin) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req).then((r) => { c.put(req, r.clone()); return r }).catch(() => hit)
        return hit || net
      }),
    )
    return
  }
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return r
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))),
  )
})
