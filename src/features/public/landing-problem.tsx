/**
 * The problem (brief section 2): the two-line headline and body on the left; on the right the
 * manual listing workflow as a card of eight steps that light up one after another once the card is
 * shown, with the hand-drawn note "Hours of repetitive work for every SKU". A warm danger tint sets
 * the band apart from the cool solution below it, without turning it red.
 */
import { ClipboardCheck, Clock3, FolderTree, Hourglass, ListChecks, PenLine, Repeat, RotateCcw, Search } from 'lucide-react'
import { useRef, type CSSProperties } from 'react'
import { IconGlyph } from '@/components/la/icons'
import { useRevealed } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { PROBLEM } from './landing-content'
import { H2, LEDE, SECTION_Y, WRAP } from './landing-kit'

const STEP_ICON = [Search, FolderTree, ListChecks, PenLine, ClipboardCheck, Hourglass, RotateCcw, Repeat] as const

export function ProblemSection() {
  const card = useRef<HTMLDivElement>(null)
  const shown = useRevealed(card)
  return (
    <section id="problem" aria-labelledby="problem-h" className="relative overflow-hidden bg-surface">
      {/* One warm wash in the far corner: the only colour the band carries. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_30%,var(--danger-bg)_0%,transparent_70%)] opacity-70" />
      <div className={cn(WRAP, SECTION_Y, 'relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16')}>
        <div className="flex flex-col">
          <p data-reveal className="eyebrow text-danger">
            {PROBLEM.eyebrow}
          </p>
          <h2 data-reveal id="problem-h" className={cn(H2, 'mt-4 max-w-[16ch] text-ink')}>
            {PROBLEM.title}
          </h2>
          <p data-reveal className={cn(LEDE, 'mt-6 max-w-[52ch] text-ink-2')}>
            {PROBLEM.body}
          </p>
          <div data-reveal className="mt-8 flex flex-wrap gap-2.5">
            {['Manual data entry', 'Marketplace-specific edits', 'Multiple checks', 'Repeated error fixes'].map((t) => (
              <span key={t} className="rounded-pill border border-danger-line bg-surface/80 px-3 py-1.5 text-small font-semibold text-danger-ink">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            ref={card}
            data-reveal
            className="relative rounded-stage border border-line bg-surface p-5 shadow-raised-lg sm:p-7"
            aria-label={PROBLEM.cardTitle}
          >
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-danger-bg text-danger">
                <IconGlyph icon={Clock3} size={20} />
              </span>
              <h3 className="text-[18px] leading-6 font-bold text-ink">{PROBLEM.cardTitle}</h3>
              <span className="ml-auto rounded-pill bg-sunken px-2.5 py-1 font-mono text-caption text-ink-3 tabular-nums">per SKU</span>
            </div>
            <ol className="tick-in mt-2 flex flex-col" data-shown={shown || undefined}>
              {PROBLEM.steps.map((s, i) => (
                <li key={s.title} style={{ '--i': i } as CSSProperties} className="flex items-center gap-3.5 border-b border-line/70 py-3 last:border-b-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-danger-bg text-danger">
                    <IconGlyph icon={STEP_ICON[i]!} size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-5 font-semibold text-ink">{s.title}</span>
                    <span className="block truncate text-small text-ink-3">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {/* The hand-drawn note, beside the card from xl, under it below. */}
          <div aria-hidden className="pointer-events-none mt-5 flex items-center justify-end gap-2 text-danger xl:absolute xl:top-[30%] xl:-right-[136px] xl:mt-0 xl:w-32 xl:flex-col xl:items-start">
            <p className="max-w-[16ch] -rotate-6 font-display text-[20px] leading-6 font-semibold italic xl:text-[17px] xl:leading-[22px]">{PROBLEM.note}</p>
            <svg viewBox="0 0 80 70" className="h-12 w-14 max-xl:-scale-x-100 max-xl:rotate-180 xl:-ml-16" fill="none">
              <path d="M70 4c4 26-10 50-50 58" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M30 52l-12 10 15 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
