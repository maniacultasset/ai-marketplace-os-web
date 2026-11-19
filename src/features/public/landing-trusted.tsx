/**
 * The trusted-by band (brief section 3): one quiet line and a slow, continuous band of logos with
 * faded edges. It pauses on hover or focus and, with reduced motion, stands still as a centred row.
 * It shows customer brands once TRUSTED_BRANDS has any (only brands that use Kuinn and agreed to be
 * named); until then it names the marketplaces Kuinn is built for.
 */
import { MARKETPLACES } from '@/components/la/marketplace'
import { cn } from '@/lib/utils'
import { TRUSTED, TRUSTED_BRANDS } from './landing-content'
import { WRAP } from './landing-kit'

interface Item {
  name: string
  logo: string
}

function Row({ items, copy }: { items: readonly Item[]; copy?: boolean }) {
  return (
    <ul aria-hidden data-copy={copy || undefined} className="flex shrink-0 items-center gap-14 pr-14 md:gap-20 md:pr-20">
      {items.map((it, i) => (
        <li
          key={`${it.name}-${i}`}
          className="flex shrink-0 items-center gap-3 opacity-70 grayscale transition-[opacity,filter] duration-300 hover:opacity-100 hover:grayscale-0"
        >
          <img src={it.logo} alt="" width={32} height={32} loading="lazy" decoding="async" draggable={false} className="size-8 rounded-lg object-contain" />
          <span className="font-display text-[20px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-ink">{it.name}</span>
        </li>
      ))}
    </ul>
  )
}

export function TrustedBand() {
  const brands = TRUSTED_BRANDS.length > 0
  const items: readonly Item[] = brands ? TRUSTED_BRANDS : MARKETPLACES.map((m) => ({ name: m.name, logo: m.logo }))
  // A short list repeats inside each copy, so the band is always wider than the screen.
  const row = items.length < 8 ? [...items, ...items] : items
  return (
    <section aria-labelledby="trusted-h" className="border-y border-line bg-canvas">
      <div className={cn(WRAP, 'pt-10 md:pt-12')}>
        <h2 id="trusted-h" className="text-center text-small font-semibold tracking-[0.02em] text-ink-3">
          {brands ? TRUSTED.brandsTitle : TRUSTED.marketplacesTitle}
        </h2>
      </div>
      {/* Focusable so keyboard users can pause it; the names are read once, from the label. */}
      <div className="marquee overflow-hidden py-8 md:py-10" tabIndex={0} role="group" aria-label={items.map((i) => i.name).join(', ')}>
        <div className="marquee-track">
          <Row items={row} />
          <Row items={row} copy />
        </div>
      </div>
    </section>
  )
}
