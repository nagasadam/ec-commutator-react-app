// One place for the Motion-library helpers, so every screen moves the same way.
import { useEffect, useRef, useState } from 'react'
import { MotionConfig, animate, stagger } from 'motion/react'

export { AnimatePresence, motion } from 'motion/react'
export const EASE = [0.2, 0.7, 0.2, 1]

// Respects the person's "reduce motion" setting everywhere Motion is used.
export const Motion = ({ children }) => <MotionConfig reducedMotion="user">{children}</MotionConfig>

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Fades the matching elements up one after another (call from an effect once they are on screen).
export function riseIn(root, selector, { y = 16, gap = 0.06 } = {}) {
  if (reduced() || !root) return undefined
  const els = root.querySelectorAll(selector)
  if (!els.length) return undefined
  return animate(els, { opacity: [0, 1], transform: [`translateY(${y}px)`, 'translateY(0px)'] }, { duration: 0.5, ease: EASE, delay: stagger(gap) })
}

// Eases a number from its previous value to the target (instant under reduced motion).
export function useCountUp(target, seconds = 0.9) {
  const [v, setV] = useState(0)
  const cur = useRef(0)
  useEffect(() => {
    if (reduced()) {
      cur.current = target
      setV(target)
      return undefined
    }
    const c = animate(cur.current, target, {
      duration: seconds,
      ease: EASE,
      onUpdate: (x) => {
        cur.current = x
        setV(x)
      },
    })
    return () => c.stop()
  }, [target, seconds])
  return v
}
