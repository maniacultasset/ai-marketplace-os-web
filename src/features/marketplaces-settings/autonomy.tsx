/**
 * Hi-fi 19 "Settings: Autonomy", v1 truth. The backend has no autonomy settings and approval is
 * always required (maker-checker), so:
 * - the Autonomous option and its toggle are hidden (showing them would mislead, DESIGN.md);
 *   Approval mode is shown as the one, selected mode with its explanation;
 * - "The agent may fix these on its own" and the retry limit describe what SI11 runs today (data
 *   fixes on their own, content approved by a person, 3 automatic tries); choosing the fixes and
 *   task notifications are planned, each with its reason;
 * - the real rule for each supported marketplace is one caption line inside the Approval mode tile;
 * - the planned cards sit together under one "Planned for a later version" heading;
 * - "Owners may approve their own listings" (ADR-0031, `#owner-approval`) and "Let Kuinn fix safe
 *   listing errors automatically" (client item 20, `#auto-fix`, `./auto-fix-setting`) are the real
 *   settings: each saves on its own, so there is still no "Save changes" footer.
 */
import { PageHeader } from '@/components/app/page-header'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { MARKETPLACES } from '@/components/la/marketplace'
import { TagChip } from '@/components/la/status-chip'
import { ComingSoon, UnavailableHint } from '@/components/la/unavailable'
import { OwnerApprovalSetting } from '@/features/team-account/owner-approval-setting'
import { AutoFixSetting } from './auto-fix-setting'
import { AUTO_FIX_TRIES, AUTONOMY_REASON, SUPPORTED } from './model'

export function AutonomySettings() {
  return (
    <div className="flex max-w-[820px] flex-col gap-4" data-testid="autonomy-settings">
      <PageHeader title="Autonomy" description="How listings are sent for this brand." className="pb-1" />

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
          aria-describedby="autonomy-mode-approval-desc autonomy-per-marketplace"
          className="focus-ring flex items-start gap-3 rounded-tile border border-brand bg-brand-bg px-3.5 py-3 shadow-selected-inset"
        >
          <span aria-hidden className="mt-0.5 size-[18px] shrink-0 rounded-full border-[5px] border-brand bg-surface" />
          <div>
            <p id="autonomy-mode-approval" className="font-bold text-ink">
              Approval mode
            </p>
            <p id="autonomy-mode-approval-desc" className="mt-1 text-small text-ink-2">
              You review and approve every listing before it is sent.
            </p>
            {/* Per marketplace: the same rule on each supported marketplace, as one line. */}
            <p id="autonomy-per-marketplace" className="mt-1.5 text-caption text-ink-3" data-testid="autonomy-per-marketplace">
              {SUPPORTED.map((m, i) => (
                <span key={m}>
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <span data-testid={`autonomy-${m}`}>
                    <span className="font-semibold text-ink-2">{MARKETPLACES.find((x) => x.id === m)?.name ?? m}:</span>{' '}
                    Approval required
                  </span>
                  {i < SUPPORTED.length - 1 ? <span className="sr-only">,</span> : null}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      <OwnerApprovalSetting />

      {/* What runs today (SI11, live), and the brand's switch for it (client item 20): data fixes
          resend on their own or wait for the seller, content waits for a person, three automatic
          tries at most. Prod QA 9 Nov: this read "Coming soon". */}
      <AutoFixSetting />

      <LaCard data-testid="autonomy-retry">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-bold text-ink">Retry limit</h3>
          <UnavailableHint reason={AUTONOMY_REASON.retry}>
            <TagChip tone="plain">Fixed</TagChip>
          </UnavailableHint>
        </div>
        <p className="mt-3 text-body text-ink">
          <span className="font-semibold tabular-nums">{AUTO_FIX_TRIES}</span> automatic tries, then the agent stops and asks
          you.
        </p>
      </LaCard>

      <section aria-labelledby="autonomy-planned" className="mt-2 flex flex-col gap-4">
        <h2 id="autonomy-planned" className="text-caption text-ink-3">
          Planned for a later version
        </h2>
        <LaCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body font-bold text-ink">Choose what the agent fixes</h3>
            <UnavailableHint reason={AUTONOMY_REASON.scope}>
              <ComingSoon />
            </UnavailableHint>
          </div>
          <p className="mt-2 text-small text-ink-2">Turning each fix on or off, and changing the number of tries.</p>
        </LaCard>
        <LaCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body font-bold text-ink">Tell me about tasks by</h3>
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
      </section>
    </div>
  )
}
