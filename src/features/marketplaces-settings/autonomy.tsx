/**
 * Hi-fi 19 "Settings: Autonomy", v1 truth. The backend has no autonomy settings and approval is
 * always required (maker-checker), so:
 * - the Autonomous option and its toggle are hidden (showing them would mislead, DESIGN.md);
 *   Approval mode is shown as the one, selected mode with its explanation;
 * - "The agent may fix these on its own", the retry limit and the task notifications are drawn as
 *   designed but disabled, each with its reason;
 * - "Per marketplace" states the real rule for each supported marketplace;
 * - there is nothing to save, so the "Save changes" footer is not rendered.
 */
import { useId } from 'react'
import { Banner } from '@/components/la/banner'
import { CardHead, LaCard } from '@/components/la/cards'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon } from '@/components/la/icons'
import { MarketplaceName } from '@/components/la/marketplace'
import { ComingSoon, UnavailableHint } from '@/components/la/unavailable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AUTO_FIX_SCOPE, AUTONOMY_REASON, NEVER_GUESSED, SUPPORTED } from './model'

export function AutonomySettings() {
  return (
    <div className="flex max-w-[820px] flex-col gap-4" data-testid="autonomy-settings">
      <div>
        <h1 className="font-display text-h1 text-ink">Autonomy</h1>
        <p className="mt-1 text-body text-ink-2">How the agent submits listings for this brand.</p>
      </div>

      <Banner tone="info" icon={CONCEPT_ICON.approval} title="Approval is always on" role="status">
        In this version a person approves every listing before it is sent to a marketplace. The agent proposes, the rules
        engine checks, and you decide.
      </Banner>

      <div role="radiogroup" aria-label="Submission mode" className="flex flex-col gap-2">
        <div
          role="radio"
          tabIndex={0}
          aria-checked
          aria-disabled
          aria-labelledby="autonomy-mode-approval"
          aria-describedby="autonomy-mode-approval-desc"
          className="focus-ring flex items-start gap-3 rounded-tile border border-brand bg-brand-bg px-3.5 py-3 shadow-selected-inset"
        >
          <span aria-hidden className="mt-0.5 size-[18px] shrink-0 rounded-full border-[5px] border-brand bg-surface" />
          <div>
            <p id="autonomy-mode-approval" className="font-bold text-ink">
              Approval mode
            </p>
            <p id="autonomy-mode-approval-desc" className="mt-1 text-small text-ink-2">
              Show a review screen and wait for your approval before every submission. This is the only mode in this
              version.
            </p>
          </div>
        </div>
      </div>

      <LaCard>
        <CardHead
          title="The agent may fix these on its own"
          sub="Planned for a later version, so all of these are off. Today the agent does not make these changes on its own, and nothing is sent without your approval."
          action={
            <UnavailableHint reason={AUTONOMY_REASON.scope}>
              <ComingSoon />
            </UnavailableHint>
          }
        />
        <ul className="mt-1">
          {AUTO_FIX_SCOPE.map((label) => (
            <li key={label} className="mt-3 flex items-center justify-between gap-3 text-body text-ink">
              <span>{label}</span>
              <StaticToggle label={label} reason={AUTONOMY_REASON.scope} />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-caption text-ink-3">{NEVER_GUESSED}</p>
      </LaCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LaCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[14px] font-bold text-ink">Retry limit</h4>
            <ComingSoon />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <UnavailableHint reason={AUTONOMY_REASON.retry}>
              <span className="inline-flex h-[34px] w-[72px] items-center justify-between rounded-control border border-line-strong bg-subtle px-2.5 text-small text-ink-3">
                <span aria-label="Not set">—</span>
                <Icon name="chev" size={16} />
              </span>
            </UnavailableHint>
            <span className="text-small text-ink-2">attempts, then ask me</span>
          </div>
        </LaCard>
        <LaCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[14px] font-bold text-ink">Tell me about tasks by</h4>
            <ComingSoon />
          </div>
          <div className="mt-3 flex flex-wrap gap-3.5">
            {['Email', 'Push', 'WhatsApp'].map((c) => (
              <UnavailableHint key={c} reason={AUTONOMY_REASON.notify}>
                <span className="inline-flex items-center gap-1.5 text-body text-ink-3">
                  <span aria-hidden className="size-[18px] rounded-sm border-[1.5px] border-line-strong bg-subtle" />
                  {c}
                </span>
              </UnavailableHint>
            ))}
          </div>
        </LaCard>
      </div>

      <LaCard>
        <h4 className="text-[14px] font-bold text-ink">Per marketplace</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {SUPPORTED.map((m) => (
            <div key={m} className="flex items-center justify-between gap-3" data-testid={`autonomy-${m}`}>
              <MarketplaceName id={m} size="sm" />
              <span className="text-small font-semibold text-ink-2">Approval required</span>
            </div>
          ))}
        </div>
      </LaCard>
    </div>
  )
}

/**
 * The hi-fi toggle (36 × 20, thumb 16), drawn off and disabled. The switch itself is the focus
 * target and the tooltip trigger; the reason is its tooltip and its accessible description.
 */
function StaticToggle({ label, reason }: { label: string; reason: string }) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="switch"
          tabIndex={0}
          aria-checked={false}
          aria-disabled
          aria-label={label}
          aria-describedby={id}
          className={cn(
            'focus-ring relative inline-block h-5 w-9 shrink-0 cursor-not-allowed rounded-full border border-dashed border-line-strong bg-subtle',
          )}
        >
          <span aria-hidden className="absolute top-px left-px size-4 rounded-full border border-line bg-surface" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  )
}
