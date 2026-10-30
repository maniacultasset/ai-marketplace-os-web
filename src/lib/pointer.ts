/** True on a touch-first device (phone, tablet). Autofocus there opens the keyboard over the page. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}
