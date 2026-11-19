/**
 * The landing's shared pieces: one page width, one section heading (eyebrow, title, lede), the accent
 * phrase and the pointer spotlight. Every section uses these, so the rhythm stays the same top to
 * bottom: eyebrow 13px tracked, title in Bricolage with tight tracking, lede at 17 to 20px.
 */
import { useCallback, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One page width for every block: 1200px, a little wider on very large screens. */
export const WRAP = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8 2xl:max-w-[1320px]'

/** Section rhythm: generous on desktop, tighter on phones. */
export const SECTION_Y = 'py-20 md:py-28 lg:py-32'

export const H2 =
  'font-display text-[clamp(2rem,2.4vw+1.1rem,3.5rem)] leading-[1.04] font-bold tracking-[-0.035em] text-balance'

export const LEDE = 'text-[17px] leading-[1.6] md:text-[18px] lg:text-[19px]'

/** The accent phrase in a headline: brand indigo on light, lifted indigo on night. */
export function Accent({ children, night }: { children: ReactNode; night?: boolean }) {
  return <span className={night ? 'text-brand-on-night' : 'text-brand'}>{children}</span>
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  align = 'left',
  night,
  className,
  titleClassName,
}: {
  id: string
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  align?: 'left' | 'center'
  night?: boolean
  className?: string
  titleClassName?: string
}) {
  const center = align === 'center'
  return (
    <div className={cn('flex flex-col', center && 'items-center text-center', className)}>
      <p data-reveal className={cn('eyebrow', night ? 'text-brand-on-night' : 'text-brand')}>
        {eyebrow}
      </p>
      <h2 data-reveal id={`${id}-h`} className={cn(H2, 'mt-4 max-w-[20ch]', night ? 'text-night-ink' : 'text-ink', titleClassName)}>
        {title}
      </h2>
      {lede ? (
        <p data-reveal className={cn(LEDE, 'mt-5 max-w-[62ch]', night ? 'text-night-ink-2' : 'text-ink-2')}>
          {lede}
        </p>
      ) : null}
    </div>
  )
}

/** Feeds the pointer position to a `.spotlight` card as --mx / --my. */
export function useSpotlight() {
  return useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])
}
