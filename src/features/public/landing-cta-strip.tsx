/**
 * The call to action between sections. The founder asked for the hero's two actions to come back
 * every couple of scrolls; each strip also restates the one difference that matters most: Kuinn does
 * not stop at writing content, it gets the listing live and resolves the errors on the way.
 */
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import { IconGlyph } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { scrollToSection } from '@/lib/scroll-to-section'
import { cn } from '@/lib/utils'
import { WRAP } from './landing-kit'

const CTA_LINES = {
  afterSolution: { lead: 'We don’t stop at content.', rest: 'Kuinn takes every listing all the way to live.' },
  afterWhy: { lead: 'From product photo to live listing.', rest: 'Created, validated, published and fixed, end to end.' },
  afterCapabilities: { lead: 'Rejected? Already being fixed.', rest: 'Kuinn diagnoses errors and resubmits for you.' },
} as const

const glideToHow = (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  scrollToSection('how')
}

export function CtaStrip({ line, night, className }: { line: keyof typeof CTA_LINES; night?: boolean; className?: string }) {
  const l = CTA_LINES[line]
  return (
    <aside aria-label="Get started" className={cn(night ? 'night-band' : 'bg-canvas', className)}>
      <div className={cn(WRAP, 'py-8 md:py-10')}>
        <div
          data-reveal
          className={cn(
            'flex flex-col gap-5 rounded-stage border px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8',
            night ? 'border-night-line bg-white/[0.04]' : 'edge-gradient border-transparent bg-surface shadow-raised-md',
          )}
        >
          <p className={cn('max-w-[46ch] text-[18px] leading-[1.45] md:text-[20px]', night ? 'text-night-ink-2' : 'text-ink-2')}>
            <span className={cn('font-display font-bold tracking-[-0.015em]', night ? 'text-night-ink' : 'text-ink')}>{l.lead}</span> {l.rest}
          </p>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className={cn('w-full sm:w-auto', night && 'shadow-none')}>
              <Link to="/signup">
                Request access
                <IconGlyph icon={ArrowRight} size={16} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className={cn('w-full sm:w-auto', night && 'border-night-line bg-white/10 text-night-ink shadow-none hover:bg-white/15')}>
              <a href="#how" onClick={glideToHow}>
                See how it works
              </a>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
