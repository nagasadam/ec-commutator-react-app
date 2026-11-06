// Small helpers for the phone app: the saved state (sign-in link, queued scans), ids, dates and number format.
const KEY = 'processscan1'
export const load = () => {
  try {
    return { biz: '', queue: [], meta: null, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { biz: '', queue: [], meta: null }
  }
}
export const save = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked: the queue stays in memory for this visit */
  }
}
export const uid = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36))
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const n = (x) => Number(x || 0).toLocaleString('en-IN')
