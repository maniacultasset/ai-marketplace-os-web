/**
 * The landing's final call to action (brief, final CTA, after image 8): a night panel with one soft
 * brand glow and a faint dot grid, the pill, the two-line headline (second line in the accent), the
 * body and both actions, then the checklist. The reference's free trial and seller count belong to
 * another product, so the checklist says what is true of Kuinn, and one line of it carries the
 * pricing note Amazon's developer website rules ask for (the header and footer "Pricing" links land
 * here, #pricing).
 */
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { IconGlyph } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { COMPANY } from './company'
import { FINAL_CTA } from './landing-content'
import { Accent, WRAP } from './landing-kit'

export function FinalCta() {
  return (
    <section id="pricing" aria-labelledby="cta-h" data-testid="final-cta" className="bg-canvas">
      <div className={cn(WRAP, 'py-20 md:py-28')}>
        <div data-reveal className="night-band relative overflow-hidden rounded-panel px-6 py-16 text-center shadow-raised-lg sm:px-10 md:py-24">
          <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 -z-10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-80 w-[70%] -translate-x-1/2 rounded-full bg-brand/30 blur-[100px]" />
          <p className="inline-flex items-center gap-2 rounded-pill border border-night-line bg-white/[0.06] px-3.5 py-1.5 text-small font-semibold text-night-ink">
            <span className="size-1.5 rounded-full bg-[#4ade80] shadow-[0_0_0_3px_rgb(74_222_128/0.25)]" />
            {FINAL_CTA.pill}
          </p>
          <h2 id="cta-h" className="mx-auto mt-7 max-w-[22ch] font-display text-[clamp(2.25rem,3.2vw+1rem,4.25rem)] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-night-ink">
            <span className="block">{FINAL_CTA.titleLead}</span> <span className="block"><Accent night>{FINAL_CTA.titleAccent}</Accent></span>
          </h2>
          <p className="mx-auto mt-6 max-w-[58ch] text-[17px] leading-[1.6] text-night-ink-2 md:text-[18px]">{FINAL_CTA.body}</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full shadow-none sm:w-auto">
              <Link to="/signup">
                {FINAL_CTA.primary}
                <IconGlyph icon={ArrowRight} size={16} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full border-night-line bg-white/10 text-night-ink shadow-none hover:bg-white/15 sm:w-auto">
              <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Kuinn demo')}`}>{FINAL_CTA.secondary}</a>
            </Button>
          </div>
          <ul className="mx-auto mt-10 flex max-w-[760px] flex-wrap justify-center gap-x-6 gap-y-3 text-small text-night-ink-2">
            {FINAL_CTA.checks.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <IconGlyph icon={Check} size={14} className="text-[#4ade80]" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
