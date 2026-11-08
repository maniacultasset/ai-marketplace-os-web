/**
 * In-page links that glide to their section. Smooth scrolling stays off globally (route changes and
 * scroll restores are instant, see index.css), so only these links ease, and only when the device
 * allows motion. The hash is kept in the address bar and focus moves to the section heading, so
 * keyboard and screen reader users land where they asked to go.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`)
  const heading = el.querySelector<HTMLElement>('h2, h1') ?? el
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
  return true
}
