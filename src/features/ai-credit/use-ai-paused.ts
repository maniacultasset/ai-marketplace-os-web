import { useEffect } from 'react'
import { useMe } from '@/lib/auth'
import { aiPaused, clearAiPausedMark, trialDaysLeft, useAiPausedMark } from './model'

/** True while AI drafting is paused (GET /auth/me `ai_paused`, or a generate just refused with 503). */
export function useAiPaused(): boolean {
  const me = useMe()
  const mark = useAiPausedMark()
  const paused = aiPaused(me.data, me.dataUpdatedAt, mark)
  const cleared = me.data?.ai_paused === false && mark !== null && me.dataUpdatedAt > mark
  useEffect(() => {
    if (cleared) clearAiPausedMark()
  }, [cleared])
  return paused
}

/** Days left in the active brand's trial, or null (not on trial, or an older backend). */
export function useTrialDaysLeft(): number | null {
  const { data: me } = useMe()
  return trialDaysLeft(me?.trial_ends_at)
}
