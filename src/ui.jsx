import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { inr } from './lib/format.js'
import { useCountUp } from './motion.jsx'

// In-page replacements for window.confirm / window.alert (blocked inside artifact viewers).
const DlgCtx = createContext(null)

export function DialogProvider({ children }) {
  const [d, setD] = useState(null)
  const close = () => setD(null)
  const api = {
    ask: (msg, onYes, label = 'Confirm') => setD({ msg, onYes, label }),
    tell: (msg) => setD({ msg }),
  }
  return (
    <DlgCtx.Provider value={api}>
      {children}
      {d && (
        <div className="ov alert" onClick={close}>
          <div className="card modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="dmsg">{d.msg}</p>
            <div className="drow">
              <button type="button" className="btn ghost" onClick={close}>
                {d.onYes ? 'Cancel' : 'OK'}
              </button>
              {d.onYes && (
                <button
                  type="button"
                  className="btn"
                  autoFocus
                  onClick={() => {
                    close()
                    d.onYes()
                  }}
                >
                  {d.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DlgCtx.Provider>
  )
}

export const useDialog = () => useContext(DlgCtx)

export const Field = ({ label, children, wide }) => (
  <label className={'fld' + (wide ? ' wide' : '')}>
    <span>{label}</span>
    {children}
  </label>
)

export function Modal({ title, onClose, children, wide }) {
  const box = useRef(null)
  const drag = useRef(null)
  // On a phone the dialog is a bottom sheet: drag its top edge down to dismiss, like iOS.
  const down = (e) => {
    if (!window.matchMedia?.('(max-width: 560px)').matches) return
    drag.current = { y: e.clientY, d: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    const s = drag.current
    if (!s || !box.current) return
    s.d = Math.max(0, e.clientY - s.y)
    box.current.style.transition = 'none'
    box.current.style.transform = `translateY(${s.d}px)`
  }
  const up = () => {
    const s = drag.current
    drag.current = null
    if (!s || !box.current) return
    if (s.d > 110) return onClose()
    box.current.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.2, 1)'
    box.current.style.transform = ''
  }
  return (
    <div className="ov" onClick={onClose}>
      <div ref={box} className={'card modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden="true" />
        <div className="mh">
          <h3>{title}</h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Swipe a card left to reveal its actions (Edit, Delete), like iOS Mail. actions: [{ label, tone, run }]
export function Swipe({ actions, children }) {
  const el = useRef(null)
  const s = useRef({ x: 0, y: 0, base: 0, mode: '', t: 0, v: 0, cur: 0 })
  const W = actions.length * 84
  const to = (x, anim) => {
    if (!el.current) return
    el.current.style.transition = anim ? 'transform 0.32s cubic-bezier(0.2, 0.9, 0.2, 1)' : 'none'
    el.current.style.transform = x ? `translateX(${x}px)` : ''
    s.current.cur = x
  }
  useEffect(() => {
    const away = (e) => el.current && s.current.cur && !el.current.parentElement.contains(e.target) && to(0, true)
    document.addEventListener('touchstart', away, { passive: true })
    return () => document.removeEventListener('touchstart', away)
  }, [])
  const start = (e) => {
    const t = e.touches[0]
    Object.assign(s.current, { x: t.clientX, y: t.clientY, base: s.current.cur, mode: '', t: Date.now(), v: 0 })
  }
  const move = (e) => {
    const t = e.touches[0]
    const c = s.current
    const dx = t.clientX - c.x
    const dy = t.clientY - c.y
    if (!c.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      c.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (c.mode !== 'h') return
    const x = Math.max(-W - 24, Math.min(0, c.base + dx))
    c.v = dx / Math.max(1, Date.now() - c.t)
    to(x < -W ? -W + (x + W) * 0.3 : x, false)
  }
  const end = () => {
    const c = s.current
    if (c.mode !== 'h') return
    to(c.cur < -W / 2 || c.v < -0.5 ? -W : 0, true)
  }
  return (
    <div className="swipe">
      <div className="swipe-acts" style={{ width: W }}>
        {actions.map((a) => (
          <button key={a.label} type="button" className={'sa ' + (a.tone || '')} onClick={() => (to(0, true), a.run())}>
            {a.label}
          </button>
        ))}
      </div>
      <div ref={el} className="swipe-in" onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
        {children}
      </div>
    </div>
  )
}

// Tracks a CSS media query (e.g. the phone layout) so lists can switch to cards.
export function useMedia(query) {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches
  const [on, setOn] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(query)
    const h = () => setOn(m.matches)
    h()
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return on
}

export { useCountUp }

// Numbers that roll up to their value (₹ amounts, or plain counts with `count`).
export const Rolling = ({ n, count }) => {
  const v = useCountUp(n ?? 0)
  return <>{count ? Math.round(v).toLocaleString('en-IN') : inr(v)}</>
}

export function Stat({ label, value, n, sub, tone, dot, meter }) {
  const counted = useCountUp(n ?? 0)
  const text = n != null ? inr(counted) : value
  const i = typeof text === 'string' ? text.lastIndexOf('.') : -1
  return (
    <div className={'stat ' + (tone || '')}>
      <div className="l">
        {label}
        <i className={'dot' + (dot ? ' dot-' + dot : '')} />
      </div>
      <div className="v">
        {i > 0 ? (
          <>
            {text.slice(0, i)}
            <em>{text.slice(i)}</em>
          </>
        ) : (
          text
        )}
      </div>
      {meter != null && (
        <div className="meter">
          <i style={{ width: Math.max(2, Math.min(100, meter)) + '%' }} />
        </div>
      )}
      {sub && <div className="s">{sub}</div>}
    </div>
  )
}

export const Empty = ({ children }) => <p className="empty">{children}</p>

// Long lists show 50 rows at a time: a thousand rows at once makes the page slow to open and to type in.
export function usePaged(rows, key, size = 50) {
  const [n, setN] = useState(size)
  useEffect(() => setN(size), [key, size])
  return {
    shown: rows.length > n ? rows.slice(0, n) : rows,
    total: rows.length,
    left: Math.max(0, rows.length - n),
    size,
    more: () => setN((x) => x + size),
    all: () => setN(Infinity),
  }
}
export const MoreRows = ({ pg }) =>
  pg.left > 0 ? (
    <div className="morerows">
      <span>Showing {(pg.total - pg.left).toLocaleString('en-IN')} of {pg.total.toLocaleString('en-IN')}</span>
      <button type="button" className="btn ghost" onClick={pg.more}>Show {Math.min(pg.size, pg.left)} more</button>
      <button type="button" className="btn ghost" onClick={pg.all}>Show all</button>
    </div>
  ) : null

// Shared table filter: free-text search + a from/to date range (dates are YYYY-MM-DD, so plain string compares work).
export function useTableFilter() {
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const needle = q.trim().toLowerCase()
  return {
    q, from, to, setQ, setFrom, setTo, needle,
    active: !!(needle || from || to),
    key: needle + '|' + from + '|' + to,
    clear: () => (setQ(''), setFrom(''), setTo('')),
    // date: row date string (or undefined for undated tables); text: searchable text of the row
    test: (date, text) =>
      (!from || (date || '') >= from) && (!to || (date || '') <= to) && (!needle || String(text || '').toLowerCase().includes(needle)),
  }
}

export function FilterBar({ f, label = 'rows', search = true, dates = true, shown, total }) {
  return (
    <div className="fbar" role="search">
      {search && <input className="search" type="search" placeholder={'Search ' + label} aria-label={'Search ' + label} value={f.q} onChange={(e) => f.setQ(e.target.value)} />}
      {dates && (
        <>
          <label className="fdate">From<input type="date" value={f.from} max={f.to || undefined} onChange={(e) => f.setFrom(e.target.value)} aria-label={label + ' from date'} /></label>
          <label className="fdate">To<input type="date" value={f.to} min={f.from || undefined} onChange={(e) => f.setTo(e.target.value)} aria-label={label + ' to date'} /></label>
        </>
      )}
      {f.active && (
        <>
          <span className="fcount">{shown} of {total}</span>
          <button type="button" className="btn ghost" onClick={f.clear}>Clear</button>
        </>
      )}
    </div>
  )
}

export const ErrBar = ({ msg }) => (msg ? <div className="err">{msg}</div> : null)

export const blankLine = () => ({ item: '', qty: '', rate: '' })

export const cleanLines = (lines) =>
  lines.filter((l) => l.item && +l.qty > 0).map((l) => ({ item: l.item, qty: +l.qty, rate: +l.rate || 0 }))

// Rows of item / qty / rate. rateFrom(item) pre-fills the rate when an item is picked.
export function LinesEditor({ items, lines, setLines, rateFrom }) {
  const set = (i, p) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)))
  return (
    <div className="lines">
      {lines.map((l, i) => (
        <div className="lrow" key={i}>
          <select
            value={l.item}
            onChange={(e) => {
              const it = items.find((x) => x.id === e.target.value)
              set(i, { item: e.target.value, rate: l.rate === '' && it && rateFrom ? rateFrom(it) || '' : l.rate })
            }}
          >
            <option value="">Item…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} ({it.unit})
              </option>
            ))}
          </select>
          <input type="number" min="0" step="any" placeholder="Qty" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
          <input type="number" min="0" step="any" placeholder="Rate" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} />
          <button type="button" className="btn ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => setLines([...lines, blankLine()])}>
        + Add line
      </button>
    </div>
  )
}
