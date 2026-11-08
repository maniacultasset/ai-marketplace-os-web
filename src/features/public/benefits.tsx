/**
 * "What Kuinn does for you": the live features as short benefit cards (BENEFITS). Every card is a
 * shipped feature, so none carries an availability tag.
 */
import type { CSSProperties } from 'react'
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

export function Benefits({ className }: { className?: string }) {
  return (
    <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-5', className)}>
      {BENEFITS.map((b, i) => (
        <li
          key={b.id}
          data-testid={`benefit-${b.id}`}
          data-reveal
          style={{ '--d': `${i * 70}ms` } as CSSProperties}
          className="flex gap-4 rounded-card border border-line bg-surface p-4 shadow-raised-md sm:flex-col sm:gap-3 sm:p-5"
        >
          <IconTile icon={ICON[b.id]} tone="brand" />
          <div className="flex min-w-0 flex-col gap-1.5 sm:gap-3">
            <h3 className="text-h3 text-ink">{b.title}</h3>
            <p className="text-small text-ink-2">{b.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
