// A small QR code writer (byte mode, error correction level M, versions 1 to 6: up to 106 characters).
// The shop-floor QR codes are short fixed strings, so this is all that is needed and it adds no dependency.
// qrMatrix(text) -> array of rows of 0/1 (no quiet zone); qrSvg(text, px) -> an SVG string with a quiet zone.

// [total codewords, data codewords per block, error-correction codewords per block, blocks]
const VER = [null, [26, 16, 10, 1], [44, 28, 16, 1], [70, 44, 26, 1], [100, 32, 18, 2], [134, 43, 24, 2], [172, 27, 16, 4]]
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]]

// GF(256) arithmetic for Reed-Solomon
const EXP = new Array(512)
const LOG = new Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 256) x ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

function rsRemainder(data, n) {
  let gen = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0)
    gen.forEach((c, j) => {
      next[j] ^= c
      next[j + 1] ^= mul(c, EXP[i])
    })
    gen = next
  }
  const rem = new Array(n).fill(0)
  for (const d of data) {
    const f = d ^ rem.shift()
    rem.push(0)
    if (f) for (let i = 0; i < n; i++) rem[i] ^= mul(gen[i + 1], f)
  }
  return rem
}

const utf8 = (s) => Array.from(new TextEncoder().encode(s))

function codewords(bytes, v) {
  const [total, dpb, epb, blocks] = VER[v]
  const cap = dpb * blocks
  const bits = []
  const put = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  put(0b0100, 4)
  put(bytes.length, 8)
  bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, cap * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad)
  const blks = []
  for (let i = 0; i < blocks; i++) {
    const d = data.slice(i * dpb, (i + 1) * dpb)
    blks.push({ d, e: rsRemainder(d, epb) })
  }
  const out = []
  for (let i = 0; i < dpb; i++) blks.forEach((b) => out.push(b.d[i]))
  for (let i = 0; i < epb; i++) blks.forEach((b) => out.push(b.e[i]))
  if (out.length !== total) throw new Error('QR size mismatch')
  return out
}

function bch(val, poly, bitsLen) {
  let r = val << bitsLen
  const top = (x) => 31 - Math.clz32(x)
  while (top(r) >= top(poly)) r ^= poly << (top(r) - top(poly))
  return (val << bitsLen) | r
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function build(v, cw, mask) {
  const n = 17 + 4 * v
  const m = Array.from({ length: n }, () => new Array(n).fill(0))
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false))
  const set = (r, c, val) => {
    if (r < 0 || c < 0 || r >= n || c >= n) return
    m[r][c] = val ? 1 : 0
    fixed[r][c] = true
  }
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        set(r0 + r, c0 + c, on)
      }
  }
  finder(0, 0)
  finder(0, n - 7)
  finder(n - 7, 0)
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  const al = ALIGN[v]
  for (const r of al)
    for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
    }
  set(n - 8, 8, 1) // dark module
  // format information: level M = 00, then the mask number
  const fmt = bch((0b00 << 3) | mask, 0b10100110111, 10) ^ 0b101010000010010
  const fb = (i) => (fmt >> i) & 1
  for (let i = 0; i <= 5; i++) set(i, 8, fb(i))
  set(7, 8, fb(6))
  set(8, 8, fb(7))
  set(8, 7, fb(8))
  for (let i = 9; i < 15; i++) set(8, 14 - i, fb(i))
  for (let i = 0; i < 8; i++) set(8, n - 1 - i, fb(i))
  for (let i = 8; i < 15; i++) set(n - 15 + i, 8, fb(i))
  // data, zigzag from the bottom right
  let bit = 0
  const total = cw.length * 8
  for (let c = n - 1, up = true; c > 0; c -= 2, up = !up) {
    if (c === 6) c--
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k
      for (const cc of [c, c - 1]) {
        if (fixed[r][cc]) continue
        const d = bit < total ? (cw[bit >> 3] >> (7 - (bit & 7))) & 1 : 0
        bit++
        m[r][cc] = d ^ (MASKS[mask](r, cc) ? 1 : 0)
      }
    }
  }
  return m
}

function penalty(m) {
  const n = m.length
  let p = 0
  const line = (get) => {
    for (let i = 0; i < n; i++) {
      let run = 1
      for (let j = 1; j < n; j++) {
        if (get(i, j) === get(i, j - 1)) run++
        else {
          if (run >= 5) p += run - 2
          run = 1
        }
      }
      if (run >= 5) p += run - 2
      for (let j = 0; j + 10 < n; j++) {
        const s = Array.from({ length: 11 }, (_, k) => get(i, j + k)).join('')
        if (s === '10111010000' || s === '00001011101') p += 40
      }
    }
  }
  line((r, c) => m[r][c])
  line((r, c) => m[c][r])
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3
  const dark = m.flat().reduce((a, b) => a + b, 0)
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
  return p
}

export function qrMatrix(text) {
  const bytes = utf8(String(text))
  let v = 1
  while (v <= 6 && VER[v][1] * VER[v][3] < bytes.length + 2) v++
  if (v > 6) throw new Error('Text too long for this QR writer')
  const cw = codewords(bytes, v)
  let best = null
  let bestP = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, cw, mask)
    const p = penalty(m)
    if (p < bestP) {
      bestP = p
      best = m
    }
  }
  return best
}

export function qrSvg(text, px = 240, quiet = 4) {
  const m = qrMatrix(text)
  const n = m.length + quiet * 2
  let d = ''
  m.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
