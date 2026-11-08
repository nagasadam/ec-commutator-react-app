import { useEffect } from 'react'

// Phone only: swipe a card-style table row left to reveal Delete (like iOS Mail). Works on any row that has a Delete button;
// tapping the red Delete area presses that same button, so every existing confirm still runs.
const W = 84
const delBtn = (tr) => [...tr.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete')
const rowOf = (el) => {
  const tr = el?.closest?.('table.cardtbl tbody tr')
  return tr && !tr.closest('.ov') ? tr : null
}

export function useRowSwipe(on) {
  useEffect(() => {
    if (!on) return undefined
    let st = null
    let open = null
    const setX = (tr, x, anim) => {
      tr.style.transition = anim ? 'transform 0.32s cubic-bezier(0.2, 0.9, 0.2, 1)' : 'none'
      tr.style.transform = x ? `translateX(${x}px)` : ''
      tr._x = x
      tr.classList.toggle('swp', x < 0)
    }
    const close = () => {
      if (open) setX(open, 0, true)
      open = null
    }
    const ts = (e) => {
      const tr = rowOf(e.target)
      if (open && open !== tr) close()
      if (!tr || !delBtn(tr)) return (st = null)
      const t = e.touches[0]
      st = { tr, x: t.clientX, y: t.clientY, base: tr._x || 0, mode: '', v: 0, t: Date.now() }
    }
    const tm = (e) => {
      if (!st) return
      const t = e.touches[0]
      const dx = t.clientX - st.x
      const dy = t.clientY - st.y
      if (!st.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        st.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (st.mode !== 'h') return
      st.v = dx / Math.max(1, Date.now() - st.t)
      const x = Math.max(-W - 24, Math.min(0, st.base + dx))
      setX(st.tr, x < -W ? -W + (x + W) * 0.3 : x, false)
    }
    const te = () => {
      if (!st || st.mode !== 'h') return (st = null)
      const tr = st.tr
      const x = tr._x < -W / 2 || st.v < -0.5 ? -W : 0
      setX(tr, x, true)
      open = x ? tr : null
      st = null
    }
    const tap = (e) => {
      const tr = e.target
      if (!tr?.classList?.contains('swp') || e.clientX <= tr.getBoundingClientRect().right) return
      e.stopPropagation()
      e.preventDefault()
      const b = delBtn(tr)
      setX(tr, 0, true)
      open = null
      b?.click()
    }
    document.addEventListener('touchstart', ts, { passive: true })
    document.addEventListener('touchmove', tm, { passive: true })
    document.addEventListener('touchend', te)
    document.addEventListener('touchcancel', te)
    document.addEventListener('click', tap, true)
    return () => {
      document.removeEventListener('touchstart', ts)
      document.removeEventListener('touchmove', tm)
      document.removeEventListener('touchend', te)
      document.removeEventListener('touchcancel', te)
      document.removeEventListener('click', tap, true)
      close()
    }
  }, [on])
}
