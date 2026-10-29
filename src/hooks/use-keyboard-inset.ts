import { useEffect } from 'react'

/**
 * While `active` on a touch device, keep `--kb-inset` on the root element at the height the
 * on-screen keyboard covers (from `visualViewport`), so a bottom sheet can sit above it. Does
 * nothing where `visualViewport` is missing; removes the variable when done.
 */
export function useKeyboardInset(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const vv = window.visualViewport
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    if (!vv || !coarse) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb-inset')
    }
  }, [active])
}
