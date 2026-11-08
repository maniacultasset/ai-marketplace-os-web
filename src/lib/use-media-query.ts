/**
 * Live media queries for React (useSyncExternalStore), so a component follows a change in the
 * system setting mid-visit (reduced motion switched on while the page is open). Without
 * matchMedia (tests, old browsers) the query reads as not matching.
 */
import { useSyncExternalStore } from 'react'

const list = (query: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = list(query)
      m?.addEventListener?.('change', cb)
      return () => m?.removeEventListener?.('change', cb)
    },
    () => list(query)?.matches ?? false,
    () => false,
  )
}

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export const usePrefersReducedMotion = () => useMediaQuery(REDUCED_MOTION)
