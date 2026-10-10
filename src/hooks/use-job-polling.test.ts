import { describe, expect, it } from 'vitest'
import { isTerminalJob, jobPollInterval } from './use-job-polling'

describe('job polling backoff', () => {
  it('1 s for 10 s, 2 s until 60 s, then 5 s', () => {
    expect(jobPollInterval(0)).toBe(1000)
    expect(jobPollInterval(9_999)).toBe(1000)
    expect(jobPollInterval(10_000)).toBe(2000)
    expect(jobPollInterval(59_999)).toBe(2000)
    expect(jobPollInterval(60_000)).toBe(5000)
  })
  it('knows terminal states', () => {
    for (const s of ['succeeded', 'partial', 'failed', 'cancelled', 'dead_letter'] as const) expect(isTerminalJob(s)).toBe(true)
    expect(isTerminalJob('queued')).toBe(false)
    expect(isTerminalJob('running')).toBe(false)
  })
})
