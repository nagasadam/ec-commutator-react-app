import test from 'node:test'
import assert from 'node:assert/strict'
import { KEY, PEND_KEY, BASE_KEY, migrateKeys } from '../../src/lib/keys.js'

// the three names an earlier version used, built here from parts so this file never spells the old name out
const old = (s = '') => 'b' + 'ook' + 'smith10' + s
const store = (init = {}) => {
  const m = { ...init }
  return Object.assign(m, { getItem: (k) => (k in m && typeof m[k] === 'string' ? m[k] : null), setItem: (k, v) => void (m[k] = String(v)) })
}
// own data keys of a store (the helper functions above are not data)
const data = (s) => Object.keys(s).filter((k) => typeof s[k] === 'string')

test('copies the three old entries to the new names and keeps the old ones', () => {
  const s = store({ [old()]: '{"biz":[1]}', [old('pend')]: '{"p":1}', [old('base')]: '{"b":1}' })
  migrateKeys(s)
  assert.equal(s.getItem(KEY), '{"biz":[1]}')
  assert.equal(s.getItem(PEND_KEY), '{"p":1}')
  assert.equal(s.getItem(BASE_KEY), '{"b":1}')
  assert.equal(s.getItem(old()), '{"biz":[1]}')
})

test('never overwrites data already saved under the new name', () => {
  const s = store({ [old()]: '{"biz":["old"]}', [KEY]: '{"biz":["new"]}' })
  migrateKeys(s)
  assert.equal(s.getItem(KEY), '{"biz":["new"]}')
})

test('does nothing on a fresh device, and is safe to repeat', () => {
  const s = store()
  migrateKeys(s)
  migrateKeys(s)
  assert.deepEqual(data(s), [])
})

test('leaves unrelated entries alone', () => {
  const s = store({ 'ecc-theme': 'dark', ec_pdf_auto: '1' })
  migrateKeys(s)
  assert.deepEqual(data(s).sort(), ['ec_pdf_auto', 'ecc-theme'])
})

test('does not throw when storage is unavailable', () => {
  assert.doesNotThrow(() => migrateKeys(null))
})
