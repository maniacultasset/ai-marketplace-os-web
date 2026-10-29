/** Shared names and classes for the four enrolment steps (enrol-wizard.tsx). */
import { cn } from '@/lib/utils'

export const ENROL_STEPS = ['Get the app', 'Scan', 'Enter code', 'Save recovery codes'] as const
export type EnrolStepIndex = 0 | 1 | 2 | 3

/** The main action of a step: fills the bar on a phone, sits right from 640px. */
export const PRIMARY = 'min-w-0 flex-1 sm:min-w-[180px] sm:flex-none'

/**
 * A show/hide disclosure (a ghost button) that keeps one look open or shut: brand text, no fill
 * when open, and its icon on the content edge (the button's 12px padding pulled back).
 */
export const TOGGLE = 'text-brand aria-expanded:bg-transparent aria-expanded:text-brand hover:text-brand'

export type StepBarVariant = 'page' | 'panel'

/**
 * A step's button bar on a phone: stuck to the bottom of the screen (above the home indicator), so
 * the main action is always in reach. `page` bleeds over the sign-in card's 16px gutter, `panel`
 * over the settings panel's 20px padding with the panel's own fill.
 */
export function stepBarClass(variant: StepBarVariant) {
  return cn(
    'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:border-t max-sm:border-line max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:shadow-raised-up',
    variant === 'page'
      ? 'max-sm:-mx-4 max-sm:bg-surface max-sm:px-4'
      : 'max-sm:-mx-5 max-sm:bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] max-sm:px-5',
  )
}
