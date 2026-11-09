/**
 * Setup wizard frame pieces (hi-fi 02-04): body padding 28/64, the 3-step stepper, a two-column
 * grid (form card + 340px context column, or 400px list + detail on step 3), and the pinned
 * footer bar (68 high).
 *
 * The stepper only checks a step that is really complete, from the same data as the Home
 * checklist: "Brand" when the brand profile has a voice, guidelines or glossary
 * (`brandProfileDone`); "Manufacturer" when the brand manufacturer is saved (GET /brand-profile).
 */
import type { ReactNode } from 'react'
import { SETUP_CONTAINER } from '@/components/app/solo-shell'
import { FooterBar } from '@/components/la/footer-bar'
import { Stepper } from '@/components/la/progress'
import { useBrandProfile } from '@/features/brand/api'
import { useBrandManufacturer } from '@/features/products/api'
import { cn } from '@/lib/utils'
import { STICKY_ASIDE, STICKY_ASIDE_XL } from '@/components/app/split-layout'
import { SETUP_STEPS, setupStepsDone } from './model'

export function SetupBody({ step, children }: { step: 0 | 1 | 2; children: ReactNode }) {
  const profile = useBrandProfile()
  const manufacturer = useBrandManufacturer()
  const done = setupStepsDone(profile.data?.data, !!manufacturer.data?.data.default_manufacturer)
  return (
    <div className="flex flex-1 flex-col">
      <div className={cn(SETUP_CONTAINER, 'flex-1 pt-7 pb-10')}>
        <Stepper steps={SETUP_STEPS} current={step} done={done} className="max-md:[&_li>span:last-child]:sr-only" />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/** Form card + 340px context column (02, 03). Stacks below 1024px. */
export function SetupColumns({
  main,
  aside,
  className,
  asideFrom = 'lg',
}: {
  main: ReactNode
  aside: ReactNode
  className?: string
  /** The breakpoint from which the aside sits beside the form (and stays in place while it scrolls). */
  asideFrom?: 'lg' | 'xl'
}) {
  return (
    <div className={cn('grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]', className)}>
      <div className="min-w-0">{main}</div>
      <aside className={cn('flex min-w-0 flex-col gap-4', asideFrom === 'xl' ? STICKY_ASIDE_XL : STICKY_ASIDE)}>{aside}</aside>
    </div>
  )
}

export function SetupFooter({ status, children }: { status: ReactNode; children: ReactNode }) {
  return (
    // FooterBar pads 28 at md; the inner row adds 36 (= the body's 64) and is capped at
    // 1240 - 2 x 28, so the save status and the primary button sit on the body's edges.
    <FooterBar
      status={<span data-testid="setup-footer-status">{status}</span>}
      className="min-h-[68px]"
      innerClassName="mx-auto max-w-[1184px] md:px-9"
    >
      {children}
    </FooterBar>
  )
}

/** The form card title block: H2 + muted line. */
export function SetupHeading({ title, sub, id }: { title: string; sub: string; id?: string }) {
  return (
    <div>
      <h2 id={id} className="text-h2 text-ink">
        {title}
      </h2>
      <p className="mt-1 text-small text-ink-2">{sub}</p>
    </div>
  )
}
