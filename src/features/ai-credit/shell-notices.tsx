/**
 * App-wide notices from GET /auth/me: the AI pause banner (one calm line, no retry button) and
 * the trial chip in the top bar. Both render nothing when the backend does not send the field.
 */
import { Link } from '@tanstack/react-router'
import { Banner } from '@/components/la/banner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CHIP_TONE } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { AI_PAUSED_TEXT, trialLabel, trialTone } from './model'
import { useAiPaused, useTrialDaysLeft } from './use-ai-paused'

export function AiPausedBanner({ className }: { className?: string }) {
  const paused = useAiPaused()
  if (!paused) return null
  return (
    <div data-testid="ai-paused-banner" className={cn('mx-auto w-full max-w-[var(--page-max)] px-4 pt-4 md:px-7', className)}>
      <Banner tone="neutral" icon="clock" role="status" title={AI_PAUSED_TEXT}>
        New drafts start again once it is back. You can still edit, review and approve.
      </Banner>
    </div>
  )
}

export function TrialChip() {
  const days = useTrialDaysLeft()
  if (days === null) return null
  const tone = trialTone(days)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/brand"
          data-testid="trial-chip"
          className={cn(
            'focus-ring inline-flex h-[26px] shrink-0 items-center rounded-full border px-2.5 text-caption font-semibold whitespace-nowrap tabular-nums',
            tone === 'attention' ? CHIP_TONE.attention : CHIP_TONE.neutral,
          )}
        >
          {trialLabel(days)}
        </Link>
      </TooltipTrigger>
      <TooltipContent>Your brand is on a free trial. To keep going after it ends, contact support.</TooltipContent>
    </Tooltip>
  )
}
