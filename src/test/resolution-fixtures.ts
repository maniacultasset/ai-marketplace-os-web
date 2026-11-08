/** SI11 resolution read fixtures (ResolutionOut, AttemptOut) for unit and component tests. */
import type { Attempt, Resolution } from '@/features/listing-flow/resolution-model'

export const at = (m: number) => `2026-11-07T09:${String(m).padStart(2, '0')}:00Z`

export const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  kind: 'submission',
  number: 1,
  version: 1,
  at: at(0),
  actor: 'user',
  outcome: 'rejected',
  failed: [],
  changed: [],
  ...over,
})

export const resolution = (over: Partial<Resolution> = {}): Resolution => ({
  state: 'idle',
  cycles_used: 0,
  max_cycles: 3,
  remote_check: null,
  attempts: [],
  next_step: { kind: 'none', task_ids: [], text: '' },
  ...over,
})
