/**
 * The hi-fi icon set (24px grid, 1.75 stroke, round caps), copied path for path from the handoff's
 * icon table so the shell matches the frames. Other glyphs come from lucide-react at the same
 * stroke (pass `strokeWidth={1.75}`).
 */
import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

const PATHS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  plus: 'M12 5v14M5 12h14',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M9 20v-6h6v6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  sliders:
    'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M6 9l6 6 6-6',
  search: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  table: 'M3 5h18v14H3zM3 10h18M9 5v14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5',
  pause: 'M8 5v14M16 5v14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  /* Not in the handoff table; drawn on the same grid for the collapse control and the menu. */
  panel: 'M4 4h16v16H4zM9 4v16',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 18,
  className,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Listing Agent mark: brand tile with the dashed "A" stroke (hi-fi LOGO). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={cn('shrink-0', className)}>
      <rect width="28" height="28" rx="8" fill="var(--brand)" />
      <path
        d="M7 20L14 8l7 12"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeDasharray="3 2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Mark + wordmark, as in the sidebar and the public header. */
export function Wordmark({
  className,
  size = 'md',
  compactBelowSm = false,
}: {
  className?: string
  size?: 'md' | 'lg'
  /** Below 640px show only the mark (the parent must carry an accessible name). */
  compactBelowSm?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display font-bold text-ink', size === 'lg' ? 'text-[16px]' : 'text-[15px]', className)}>
      <LogoMark />
      <span className={cn('whitespace-nowrap', compactBelowSm && 'max-sm:hidden')}>Listing Agent</span>
    </span>
  )
}
