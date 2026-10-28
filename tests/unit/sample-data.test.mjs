import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseBackup } from '../../src/lib/backup.js'
import { GSTIN_RE } from '../../src/lib/rules.js'
import { bigSampleBiz, SAMPLE_RECORDS } from '../../src/lib/sample.js'
import { valuation, saleRows, purRows } from '../../src/lib/calc.js'

test('sample data generator makes a valid, importable business with the asked number of records', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ec-sample-')), 'sample.json')
  const r = spawnSync('node', ['scripts/gen-sample-data.mjs', f, '1000'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr) // the backup-file script still works
  assert.ok(!parseBackup(fs.readFileSync(f, 'utf8')).error)
  const b = bigSampleBiz(1000)
  const records = ['inv', 'pur', 'tx', 'exp', 'prod', 'sr', 'prr', 'rej'].reduce((s, k) => s + b[k].length, 0)
  assert.equal(records, 1000)
  assert.ok(b.cust.filter((c) => c.company).every((c) => GSTIN_RE.test(c.gstin)))
  assert.ok(b.sup.filter((c) => c.company).every((c) => GSTIN_RE.test(c.gstin)))
  const ids = (a) => new Set(a.map((x) => x.id)).size === a.length
  assert.ok(['inv', 'pur', 'tx', 'exp', 'prod', 'cust', 'sup'].every((k) => ids(b[k])))
  const v = valuation(b)
  assert.ok(Object.values(v.qty).every((q) => q >= 0), 'stock never goes negative')
  assert.equal(saleRows(b).length, b.inv.length)
  assert.equal(purRows(b).length, b.pur.length)
})

test('the in-app test data is 3,000 records by default and is the same every time', () => {
  const count = (b) => ['inv', 'pur', 'tx', 'exp', 'prod', 'sr', 'prr', 'rej'].reduce((s, k) => s + b[k].length, 0)
  const a = bigSampleBiz(), c = bigSampleBiz()
  assert.equal(SAMPLE_RECORDS, 3000)
  assert.equal(count(a), 3000)
  assert.deepEqual({ ...a, id: 0 }, { ...c, id: 0 })
})
