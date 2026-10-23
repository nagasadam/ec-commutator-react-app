// Run: npm run check
// Compares computed figures for the demo business with notes §9.
import { demoBiz, GUIDE } from '../src/lib/seed.js'
import { calc } from '../src/lib/calc.js'

const got = calc(demoBiz())
let bad = 0
for (const [k, want] of Object.entries(GUIDE)) {
  const have = got[k]
  const diff = Math.round((have - want) * 100) / 100
  const ok = Math.abs(diff) < 0.005
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${k.padEnd(13)} expected ${String(want).padStart(11)}  got ${String(have).padStart(11)}${ok ? '' : `  (off by ${diff})`}`)
}
console.log(bad ? `\n${bad} figure(s) differ` : '\nall figures match')
