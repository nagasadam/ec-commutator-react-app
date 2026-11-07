// Names of the browser-storage entries, and a one-time move from the names an earlier version used.
export const KEY = 'ec-commutator10' // all businesses: { biz: [...], cur }
export const PEND_KEY = 'ec-commutator10pend' // cloud changes not yet sent
export const BASE_KEY = 'ec-commutator10base' // last copy known to match the cloud

// An earlier version stored the same three things under names ending in "smith10", "smith10pend" and "smith10base".
const OLD = /^[a-z]+smith10(pend|base)?$/

// Copies each old entry to its new name when the new one is empty. The old entry is left in place, so going
// back to an older version still finds its data. Safe to call any number of times; never throws.
export function migrateKeys(storage) {
  try {
    const olds = Object.keys(storage).filter((k) => OLD.test(k))
    for (const k of olds) {
      const to = { '': KEY, pend: PEND_KEY, base: BASE_KEY }[k.match(OLD)[1] || '']
      if (storage.getItem(to) == null && storage.getItem(k) != null) storage.setItem(to, storage.getItem(k))
    }
  } catch {
    /* storage unavailable: the app starts with its usual empty state */
  }
}
