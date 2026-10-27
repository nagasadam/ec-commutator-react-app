// Export / import of the whole data set as JSON. Import is validated and migrated
// before anything is touched, so a bad file can never damage the current data.
import { ARRAYS, fixBiz } from './model.js'

export const FORMAT = 'ec-commutator-backup'

export const exportJson = (S) => JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), data: S }, null, 2)

export function parseBackup(text) {
  let j
  try {
    j = JSON.parse(text)
  } catch {
    return { error: 'This file is not valid JSON.' }
  }
  const S = j?.format === FORMAT ? j.data : j
  if (!S || !Array.isArray(S.biz) || !S.biz.length) return { error: 'No businesses found in this file.' }
  for (const b of S.biz) {
    if (!b || typeof b.id !== 'string' || typeof b.name !== 'string') return { error: 'A business in the file is malformed.' }
    for (const k of ARRAYS) if (b[k] != null && !Array.isArray(b[k])) return { error: `"${b.name}": ${k} must be a list.` }
    fixBiz(b)
  }
  if (!S.biz.some((b) => b.id === S.cur)) S.cur = S.biz[0].id
  return { S: { biz: S.biz, cur: S.cur } }
}

// Add businesses from a backup, giving a fresh id to any that would clash.
export function mergeBackup(S, incoming, newId) {
  const have = new Set(S.biz.map((b) => b.id))
  const names = new Set(S.biz.map((b) => String(b.name).trim().toLowerCase()))
  // Names stay unique: a clash becomes "X (imported)", then "X (imported 2)" and so on.
  const free = (name) => {
    let n = name
    for (let k = 1; names.has(n.trim().toLowerCase()); k++) n = `${name} (imported${k > 1 ? ' ' + k : ''})`
    names.add(n.trim().toLowerCase())
    return n
  }
  const add = incoming.biz.map((b) => {
    const clash = have.has(b.id)
    const name = free(b.name)
    return clash || name !== b.name ? { ...b, ...(clash ? { id: newId() } : {}), name } : b
  })
  return { biz: [...S.biz, ...add], cur: S.cur }
}
