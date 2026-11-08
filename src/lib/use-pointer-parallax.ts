/**
 * Pointer parallax for a hero: where the pointer sits over `ref`, as -1 to 1 on each axis, fed into
 * near critically damped springs (stiffness 140, damping 26), so layers drift and settle without
 * overshoot. Everything returns to 0 when the pointer leaves.
 *
 * It only listens when `enabled`, a fine hovering pointer is present ((hover: hover) and
 * (pointer: fine)) and reduced motion is off. Otherwise the springs rest at 0, so callers can map
 * them into transforms unconditionally.
 */
import { useSpring, type MotionValue } from 'motion/react'
import { useEffect, type RefObject } from 'react'
import { useMediaQuery, usePrefersReducedMotion } from './use-media-query'

const SPRING = { stiffness: 140, damping: 26 }
const clamp = (v: number) => Math.max(-1, Math.min(1, v))

export function usePointerParallax(ref: RefObject<HTMLElement | null>, enabled = true): { x: MotionValue<number>; y: MotionValue<number> } {
  const x = useSpring(0, SPRING)
  const y = useSpring(0, SPRING)
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)')
  const reduced = usePrefersReducedMotion()
  const on = enabled && fine && !reduced

  useEffect(() => {
    const el = ref.current
    if (!on || !el) {
      x.set(0)
      y.set(0)
      return
    }
    let rect: DOMRect | null = null
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      rect ??= el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      x.set(clamp(((e.clientX - rect.left) / rect.width) * 2 - 1))
      y.set(clamp(((e.clientY - rect.top) / rect.height) * 2 - 1))
    }
    const enter = () => {
      rect = el.getBoundingClientRect()
    }
    const leave = () => {
      rect = null
      x.set(0)
      y.set(0)
    }
    // The hero moves on the page as it scrolls, so measure again on the next move.
    const invalidate = () => {
      rect = null
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointermove', move, { passive: true })
    el.addEventListener('pointerleave', leave)
    window.addEventListener('scroll', invalidate, { passive: true })
    window.addEventListener('resize', invalidate)
    return () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      window.removeEventListener('scroll', invalidate)
      window.removeEventListener('resize', invalidate)
      x.set(0)
      y.set(0)
    }
  }, [on, ref, x, y])

  return { x, y }
}
