export const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

export const inr = (n) => {
  const v = r2(n)
  return (
    (v < 0 ? '-' : '') +
    '₹' +
    Math.abs(v).toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  )
}

export const qtyFmt = (n) => Number((Number(n) || 0).toFixed(3)).toLocaleString('en-IN')

export const uid = () => Math.random().toString(36).slice(2, 9)

export const today = () => new Date().toISOString().slice(0, 10)

export const dmy = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
