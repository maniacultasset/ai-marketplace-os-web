import { describe, expect, it } from 'vitest'
import { agentLine, countWorking } from './agent-status'

describe('countWorking', () => {
  it('counts like Home "In progress": busy statuses plus published still waiting on the marketplace', () => {
    const pages = [
      { data: [{ status: 'generating', marketplace_state: 'not_submitted' }], page: { has_more: false } },
      { data: [{ status: 'publishing', marketplace_state: 'not_submitted' }], page: { has_more: false } },
      {
        data: [
          { status: 'published', marketplace_state: 'processing' },
          { status: 'published', marketplace_state: 'pending_review' },
          { status: 'published', marketplace_state: 'live' },
          { status: 'published', marketplace_state: 'removed' },
        ],
        page: { has_more: true },
      },
    ] as const
    expect(countWorking(pages)).toEqual({ count: 4, more: true })
    expect(agentLine({ pending: false, failed: false, ...countWorking(pages) })).toBe('Working on 4+ listings')
  })
  it('ignores pages still loading', () => {
    expect(countWorking([undefined])).toEqual({ count: 0, more: false })
  })
})
