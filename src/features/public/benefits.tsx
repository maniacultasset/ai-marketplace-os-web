/**
 * "What Kuinn does for your team": the live features as short benefit cards (BENEFITS). Every card
 * is a shipped feature, so none carries an availability tag.
 *
 * Five cards never leave one alone on a row: two columns with the fifth spanning both (laid out
 * sideways) from sm, three then two from lg, and one row of five from 2xl. The cards are not links,
 * so they never lift on hover.
 */
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconTile, type IconSource } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { BENEFITS, type Benefit } from './model'

const ICON: Record<Benefit['id'], IconSource> = {
  draft: CONCEPT_ICON.agent,
  photos: 'eye',
  checks: CONCEPT_ICON.rules,
  fixes: CONCEPT_ICON.edit,
  images: 'image',
}

/** Where each card sits on the lg six-column grid (3 + 2) and whether it is the wide last card on sm. */
const PLACE = ['lg:col-span-2', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-3'] as const

export function Benefits({ className }: { className?: string }) {
  return (
    <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-6 2xl:grid-cols-5', className)}>
      {BENEFITS.map((b, i) => {
        const last = i === BENEFITS.length - 1
        return (
          <li
            key={b.id}
            data-testid={`benefit-${b.id}`}
            data-reveal
            className={cn(
              'flex gap-4 rounded-card border border-line bg-surface p-5 shadow-raised-md 2xl:col-span-1',
              PLACE[i],
              last ? 'sm:col-span-2 lg:flex-col lg:gap-3' : 'sm:flex-col sm:gap-3',
            )}
          >
            <IconTile icon={ICON[b.id]} tone="brand" />
            <div className={cn('flex min-w-0 flex-col gap-1.5', last ? 'lg:gap-2' : 'sm:gap-2')}>
              <h3 className="text-h3 text-ink">{b.title}</h3>
              <p className="max-w-[48ch] text-[15px] leading-[1.55] text-ink-2">{b.body}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
