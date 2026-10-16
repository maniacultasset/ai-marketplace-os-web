/**
 * Honest states for things the design shows but the backend cannot do yet (see DESIGN.md
 * "Not in the API yet"). Never render a dead control that looks live:
 *
 *   <UnavailableButton reason="Google sign-in is not available yet.">Continue with Google</UnavailableButton>
 *   <UnavailableButton variant="secondary" size="sm" reason="…">Join waitlist</UnavailableButton>
 *   <ComingSoon />                         // "Coming soon" tag
 *
 * The button stays focusable (aria-disabled, not `disabled`) so keyboard and screen-reader users
 * reach the reason; clicks do nothing. The reason is the tooltip and the accessible description.
 */
import { useId, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TagChip } from './status-chip'

export function UnavailableButton({
  reason,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'disabled' | 'asChild'> & { reason: string; children: ReactNode }) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-disabled
          aria-describedby={id}
          data-unavailable
          onClick={(e) => e.preventDefault()}
          className={cn('hover:bg-[unset]', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  )
}

export function ComingSoon({ className, children = 'Coming soon' }: { className?: string; children?: ReactNode }) {
  return (
    <TagChip tone="plain" className={className}>
      {children}
    </TagChip>
  )
}

/** Wrap any non-button element that is unavailable, with the reason as tooltip. */
export function UnavailableHint({ reason, children }: { reason: string; children: ReactNode }) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-disabled
          aria-describedby={id}
          className="focus-ring inline-flex cursor-not-allowed rounded-control"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  )
}

/** One sentence per missing backend capability, reused verbatim across screens. */
export const NOT_YET = {
  googleSignIn: 'Google sign-in is not available yet. Use your email and password.',
  emailCode: 'Email codes are not available yet. A person reviews every sign-up instead.',
  readSite: 'Reading your website is not available yet. Fill the fields yourself.',
  waitlist: 'This marketplace is not supported yet and the waitlist is not open.',
  intakeUrl: 'Adding a product from a page URL is not available yet.',
  intakePhotos: 'Adding products from photos is not available yet.',
  intakeCatalog: 'Importing another marketplace’s catalog export is not available yet.',
  pim: 'Connecting a PIM or ERP is not part of this version.',
  autonomy: 'Every listing needs a person’s approval before it is sent. Autonomous mode is not available.',
  pickupLocations: 'Pickup locations and shipping defaults are not available yet.',
  brandAuthorisation: 'Uploading brand authorisation proof is not available yet.',
  answerTask: 'Answering questions here is not available yet.',
  pauseArchive: 'Pausing and archiving listings is not available yet.',
  activityFeed: 'A brand-wide activity feed is not available yet. Each listing keeps its own history.',
  notifications: 'Notifications are not available yet.',
  productSearch: 'Search is not available yet. Filter the loaded products on the Products page.',
  export: 'Exporting the catalog is not available yet.',
  auditLog: 'A brand-wide audit log is not available yet.',
  chooseCategory: 'Choosing a category from here is not available yet. Open the product to change its content.',
  askSupport: 'Contacting support from the app is not available yet.',
} as const
