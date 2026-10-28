// Writes the large test business as a backup file (the app can also load it directly: Manage > Load 3,000 test records).
//   node scripts/gen-sample-data.mjs [out.json] [records]
import fs from 'node:fs'
import { exportJson } from '../src/lib/backup.js'
import { calc } from '../src/lib/calc.js'
import { bigSampleBiz, SAMPLE_RECORDS } from '../src/lib/sample.js'

const out = process.argv[2] || 'ec-sample-3000.json'
const b = bigSampleBiz(+process.argv[3] || SAMPLE_RECORDS)
fs.writeFileSync(out, exportJson({ biz: [b], cur: b.id }))
const count = ['inv', 'pur', 'tx', 'exp', 'prod', 'sr', 'prr', 'rej'].reduce((s, k) => s + b[k].length, 0)
const c = calc(b)
console.log(`${out}: ${count} records + ${b.cust.length} customers, ${b.sup.length} suppliers`)
console.log(`sales ${c.sales.toLocaleString('en-IN')}  receivable ${c.receivable.toLocaleString('en-IN')}  payable ${c.payable.toLocaleString('en-IN')}  profit ${c.profit.toLocaleString('en-IN')}  size ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`)
