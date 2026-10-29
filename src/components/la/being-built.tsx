/**
 * Placeholder for a route whose screen builder has not landed yet (see docs/DESIGN.md "Route
 * ownership"). Honest: it names the screen and says it is being built; no fake data, no controls.
 * Every use of this component is replaced by its owner area.
 */
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { DashedCard } from './cards'
import { Icon } from './icons'

export function BeingBuilt({
  title,
  description,
  frame,
  children,
}: {
  title: string
  description?: string
  /** Hi-fi frame this route implements, e.g. "06 Home". */
  frame: string
  /** Links to the working screens that cover this area today. */
  children?: ReactNode
}) {
  return (
    <Page>
      <PageHeader title={title} description={description} />
      <DashedCard className="flex flex-col items-start gap-3" data-testid="being-built">
        <span className="inline-flex size-11 items-center justify-center rounded-tile bg-subtle text-ink-2" aria-hidden>
          <Icon name="clock" size={22} />
        </span>
        <div>
          <h2 className="text-h3 text-ink">This screen is being built</h2>
          <p className="mt-1 text-body text-ink-2">It follows design frame {frame}. Nothing here is live yet.</p>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </DashedCard>
    </Page>
  )
}
