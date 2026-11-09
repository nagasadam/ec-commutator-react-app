import test from 'node:test'
import assert from 'node:assert/strict'
import { matchItem, matchParty, learnAliases, totalIssue, buildDraft, aliasKey } from '../../src/lib/pdf/match.js'
import { parseDocument } from '../../src/lib/pdf/parse.js'
import { fixBiz, mkBiz } from '../../src/lib/model.js'

const items = [{ id: 'a', name: 'Copper coil', hsn: '7408' }, { id: 'b', name: 'Mica', hsn: '2525' }]

test('a remembered correction wins over guessing', () => {
  assert.equal(matchItem(items, 'Sheet XYZ 0.5mm'), null)
  assert.equal(matchItem(items, 'Sheet XYZ 0.5mm', '', { [aliasKey('Sheet XYZ 0.5mm')]: 'b' }).id, 'b')
})

test('alias to a deleted item is ignored', () => {
  assert.equal(matchItem(items, 'Mica sheet', '', { [aliasKey('Mica sheet')]: 'gone' }).id, 'b')
})

test('party alias', () => {
  const list = [{ id: 's1', name: 'Sterling Copper Pvt Ltd' }]
  assert.equal(matchParty(list, { name: 'STERLING CU' }), null)
  assert.equal(matchParty(list, { name: 'STERLING CU' }, { [aliasKey('STERLING CU')]: 's1' }).id, 's1')
})

test('learnAliases stores items and supplier; fixBiz adds the store to old data', () => {
  const x = fixBiz({ items: [], id: 'z' })
  learnAliases(x, 'purchase', { partyName: 'Sterling CU' }, 's1', [{ desc: 'Wire 2mm', item: 'a' }, { desc: '', item: 'b' }])
  assert.equal(x.alias.sup[aliasKey('Sterling CU')], 's1')
  assert.deepEqual(x.alias.item, { [aliasKey('Wire 2mm')]: 'a' })
  const b = mkBiz()
  b.sup.push({ id: 's1', name: 'Other' })
  b.items.push({ id: 'q', name: 'Foo', type: 'raw', hsn: '' })
  learnAliases(b, 'purchase', { partyName: 'Sterling CU' }, 's1', [{ desc: 'Wire 2mm', item: 'q' }])
  const d = buildDraft(b, { party: { name: 'Sterling CU' }, rows: [{ desc: 'Wire 2mm', qty: 1, rate: 1 }], date: '2026-01-01' }, 'purchase')
  assert.equal(d.party, 's1')
  assert.equal(d.rows[0].item, 'q')
})

test('total check', () => {
  const rows = [{ qty: 10, rate: 100 }]
  assert.equal(totalIssue({ total: 1180, rows }), '')
  assert.equal(totalIssue({ total: 1000, rows }), '')
  assert.equal(totalIssue({ total: 0, rows }), '')
  assert.match(totalIssue({ total: 1500, rows }), /does not match/)
})

test('parser reads the printed total', () => {
  const p = parseDocument(['Tax Invoice', 'Grand Total  Rs. 1,180.00'], 'purchase')
  assert.equal(p.total, 1180)
})
