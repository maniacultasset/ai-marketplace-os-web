/**
 * Who it is for (brief section 7, after image 6): brands, retailers and agencies, three cards with a
 * pointer spotlight and a link that leads to the access request. Each card names what that kind of
 * business gets from features that exist today (brand voice, CSV import with per-row reports, one
 * login for many brands with separate approvers).
 */
import { ArrowRight, Building2, Check, Store, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { IconGlyph } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { AUDIENCE } from './landing-content'
import { SectionHeading, SECTION_Y, useSpotlight, WRAP } from './landing-kit'

const ICON = { brands: Building2, retailers: Store, agencies: Users } as const

export function AudienceSection() {
  const spot = useSpotlight()
  return (
    <section id="who" aria-labelledby="who-h" className="bg-canvas">
      <div className={cn(WRAP, SECTION_Y)}>
        <SectionHeading id="who" eyebrow={AUDIENCE.eyebrow} title={AUDIENCE.title} lede={AUDIENCE.body} align="center" />
        <ul className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {AUDIENCE.cards.map((c) => (
            <li
              key={c.id}
              data-reveal
              onPointerMove={spot}
              className="spotlight group flex flex-col rounded-stage border border-line bg-surface p-6 shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-brand-line hover:shadow-raised-lg md:p-7"
            >
              <span className="grid size-12 place-items-center rounded-tile border border-brand-line/70 bg-brand-bg text-brand">
                <IconGlyph icon={ICON[c.id]} size={22} />
              </span>
              <h3 className="mt-6 font-display text-[24px] leading-7 font-bold tracking-[-0.02em] text-ink">{c.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.6] text-ink-2">{c.body}</p>
              <ul className="mt-5 flex flex-col gap-2 border-t border-line pt-5">
                {c.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-small font-medium text-ink">
                    <IconGlyph icon={Check} size={14} className="text-success" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className="hit-area mt-auto inline-flex items-center gap-1.5 self-start pt-7 text-[15px] font-semibold text-brand underline-offset-4 hover:underline"
              >
                {c.cta}
                <IconGlyph icon={ArrowRight} size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
