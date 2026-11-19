/**
 * The hero's entrance for the lines after the h1 (sub, actions, numbers, theatre): rise 12px over
 * 480ms on the calm curve, each at its own delay. The h1 never waits (it is the LCP element).
 * Reduced motion, or a mount after the first paint, shows the content at once.
 */
import { domAnimation, LazyMotion, m } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { usePrefersReducedMotion } from '@/lib/use-media-query'

const CALM = [0.22, 1, 0.36, 1] as const

export function HeroRise({ delay, className, children }: { delay: number; className?: string; children: ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const [play] = useState(!reduced)
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={className}
        initial={play ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, delay: delay / 1000, ease: CALM }}
      >
        {children}
      </m.div>
    </LazyMotion>
  )
}
