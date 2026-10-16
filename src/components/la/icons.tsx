/**
 * The icon system (docs/DESIGN.md → Icons).
 * - `Icon`: the hi-fi set (24px grid, 1.75 stroke, round caps), copied path for path from the
 *   handoff's icon table so the shell matches the frames. Prefer these names.
 * - lucide-react for anything the set lacks. Its default stroke is redrawn at 1.75 globally
 *   (index.css), so every glyph shares one weight. Sizes: 14 dense, 16 controls, 18 nav and
 *   banners, 20 top bar; inside an `IconTile` the tile picks the size.
 * - `IconTile`: a raised matte squircle with a tinted fill that holds one icon (nav emphasis,
 *   card headers, empty states, banners). `MonogramTile` is the same tile with letters, used only
 *   where the design uses a monogram (marketplaces, brand).
 * Never emoji or a letter as an icon outside a monogram tile.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode, SVGProps } from 'react'
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
  clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  user: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c1-4 4.5-6 8-6s7 2 8 6',
  users: 'M6 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2 20c.8-3.4 3.6-5 7.5-5s6.7 1.6 7.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 15c1.8.6 3 2.2 3.5 5',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v5M12 8h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
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

/** Any icon the app uses: a hi-fi name or a lucide component (rendered at the shared weight). */
export type IconSource = IconName | LucideIcon

export function IconGlyph({ icon, size = 18, className }: { icon: IconSource; size?: number; className?: string }) {
  if (typeof icon === 'string') return <Icon name={icon} size={size} className={className} />
  const L = icon
  return <L size={size} strokeWidth={1.75} aria-hidden className={cn('shrink-0', className)} />
}

export type TileTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'fail'
export type TileSize = 'sm' | 'md' | 'lg'

const TILE_TONE: Record<TileTone, string> = {
  neutral: 'border-[var(--tile-neutral-line)] bg-[var(--tile-neutral-bg)] text-[var(--tile-neutral-fg)]',
  brand: 'border-[var(--tile-brand-line)] bg-[var(--tile-brand-bg)] text-[var(--tile-brand-fg)]',
  ok: 'border-[var(--tile-ok-line)] bg-[var(--tile-ok-bg)] text-[var(--tile-ok-fg)]',
  warn: 'border-[var(--tile-warn-line)] bg-[var(--tile-warn-bg)] text-[var(--tile-warn-fg)]',
  fail: 'border-[var(--tile-fail-line)] bg-[var(--tile-fail-bg)] text-[var(--tile-fail-fg)]',
}

/** Tile box and the icon size that sits in it. sm 28/16, md 36/18, lg 44/22. */
const TILE_SIZE: Record<TileSize, { box: string; icon: number }> = {
  sm: { box: 'size-7 rounded-[8px]', icon: 16 },
  md: { box: 'size-9 rounded-[10px]', icon: 18 },
  lg: { box: 'size-11 rounded-[12px]', icon: 22 },
}

const TILE_BASE = 'inline-flex shrink-0 items-center justify-center border shadow-raised-sm'

/** Raised matte squircle holding one icon. Decorative: the text next to it carries the meaning. */
export function IconTile({
  icon,
  tone = 'neutral',
  size = 'md',
  flat,
  className,
}: {
  icon: IconSource
  tone?: TileTone
  size?: TileSize
  /** No shadow, for tiles inside an already raised small element (menus, chips). */
  flat?: boolean
  className?: string
}) {
  const s = TILE_SIZE[size]
  return (
    <span aria-hidden data-slot="icon-tile" data-tone={tone} className={cn(TILE_BASE, s.box, TILE_TONE[tone], flat && 'shadow-none', className)}>
      <IconGlyph icon={icon} size={s.icon} />
    </span>
  )
}

/** The same tile with a monogram (marketplace or brand initial), display font. */
export function MonogramTile({
  children,
  tone = 'neutral',
  size = 'md',
  flat,
  className,
}: {
  children: ReactNode
  tone?: TileTone
  size?: TileSize
  flat?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      data-slot="monogram-tile"
      className={cn(
        TILE_BASE,
        TILE_SIZE[size].box,
        TILE_TONE[tone],
        'font-display font-bold',
        tone === 'neutral' && 'text-ink',
        size === 'sm' && 'text-[13px]',
        size === 'md' && 'text-[15px]',
        size === 'lg' && 'text-[18px]',
        flat && 'shadow-none',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Listing Agent mark: brand tile with the dashed "A" stroke (hi-fi LOGO). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={cn('shrink-0 rounded-[8px] shadow-raised-brand', className)}>
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
