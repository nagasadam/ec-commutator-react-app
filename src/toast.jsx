import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const Ctx = createContext({ push: () => {}, saved: () => {} })

// kind: 'ok' | 'err' | 'info'. Errors stay until dismissed; others fade after `ms`.
export function ToastProvider({ children }) {
  const [list, setList] = useState([])
  const n = useRef(0)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setList((l) => l.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (msg, kind = 'ok', opts = {}) => {
      // `key` replaces an existing toast instead of stacking (so typing in a field shows one "Saved").
      const id = opts.key || ++n.current
      setList((l) => [...l.filter((t) => t.id !== id), { id, msg, kind }].slice(-4))
      clearTimeout(timers.current.get(id))
      if (kind !== 'err') timers.current.set(id, setTimeout(() => dismiss(id), opts.ms ?? 2400))
      return id
    },
    [dismiss],
  )

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <Ctx.Provider value={{ push, dismiss }}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} role={t.kind === 'err' ? 'alert' : 'status'}>
            <i aria-hidden="true">{t.kind === 'ok' ? '✓' : t.kind === 'err' ? '!' : 'i'}</i>
            <span>{t.msg}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
