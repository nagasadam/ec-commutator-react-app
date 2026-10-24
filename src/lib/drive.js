// Google Drive access for PDF import. Browser only, no server: Google Identity Services
// gives a short-lived access token (read-only scope), then the Drive REST API lists a
// folder and downloads files straight into the browser. Every network piece is injectable
// so the logic can be tested without Google.
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const API = 'https://www.googleapis.com/drive/v3/files'
const GIS_URL = 'https://accounts.google.com/gsi/client'

const err = (code, message) => Object.assign(new Error(message), { code })

// Accepts a folder link in any of Drive's forms, or a bare folder id.
export function parseFolderId(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : ''
}

// ---------------------------------------------------------------- sign-in
let gisP
function loadGis() {
  gisP ||= new Promise((res, rej) => {
    if (globalThis.google?.accounts?.oauth2) return res(globalThis.google)
    const el = document.createElement('script')
    el.src = GIS_URL
    el.async = true
    el.onload = () => res(globalThis.google)
    el.onerror = () => {
      gisP = null
      rej(err('offline', 'Could not load Google sign-in. Check your connection and try again.'))
    }
    document.head.appendChild(el)
  })
  return gisP
}

let cached = null // { token, exp }
export const forgetToken = () => (cached = null)

// Resolves with an access token. Reuses an unexpired one; otherwise opens Google's consent popup,
// so call it from a click.
export async function getToken(clientId, { gis, now = Date.now } = {}) {
  if (cached && cached.exp > now() + 60_000) return cached.token
  const g = gis || (await loadGis())
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r?.error) return reject(err(r.error === 'access_denied' ? 'denied' : 'auth', r.error === 'access_denied' ? 'Google access was not granted.' : `Google sign-in failed (${r.error}).`))
        cached = { token: r.access_token, exp: now() + (+r.expires_in || 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(err('denied', e?.type === 'popup_closed' ? 'The Google sign-in window was closed.' : 'Google sign-in failed.')),
    })
    client.requestAccessToken({ prompt: cached ? '' : 'consent' })
  })
}

// ------------------------------------------------------------------- API
async function call(url, token, f) {
  let r
  try {
    r = await f(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw err('offline', 'Could not reach Google Drive. Check your connection.')
  }
  if (r.status === 401) {
    forgetToken()
    throw err('expired', 'Google access expired. Click Connect again.')
  }
  if (r.status === 404) throw err('not-found', 'Folder not found, or your Google account cannot open it. Check the link.')
  if (r.status === 403) throw err('forbidden', 'Google refused access to this folder.')
  if (!r.ok) throw err('drive', `Google Drive error (${r.status}).`)
  return r
}

// PDFs directly inside the folder, newest first.
export async function listPdfs(folderId, token, f = globalThis.fetch.bind(globalThis), max = 200) {
  const q = encodeURIComponent(`'${folderId.replace(/'/g, '')}' in parents and mimeType='application/pdf' and trashed=false`)
  const out = []
  let page = ''
  do {
    const url = `${API}?q=${q}&fields=${encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime)')}&orderBy=modifiedTime%20desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + encodeURIComponent(page) : ''}`
    const j = await (await call(url, token, f)).json()
    out.push(...(j.files || []))
    page = j.nextPageToken || ''
  } while (page && out.length < max)
  return out.slice(0, max).map((x) => ({ id: x.id, name: x.name, size: +x.size || 0, modified: (x.modifiedTime || '').slice(0, 10) }))
}

// A File-like object that extractLines() accepts.
export async function downloadPdf(file, token, f = globalThis.fetch.bind(globalThis)) {
  const r = await call(`${API}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, token, f)
  const buf = await r.arrayBuffer()
  return { name: file.name, size: buf.byteLength, arrayBuffer: async () => buf }
}
