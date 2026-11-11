import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListingDetail } from '@/features/listings/model'

const s = vi.hoisted(() => ({ role: 'owner' as string, on: false }))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useMe: () => ({ data: { user_id: 'me', role: s.role }, isError: false }),
}))
vi.mock('@/features/brand/api', async (orig) => ({
  ...(await orig<typeof import('@/features/brand/api')>()),
  useBrandProfile: () => ({ data: { data: { owner_self_approval: s.on } }, isPending: false, isError: false }),
}))
vi.mock('@/features/listings/api', () => ({
  useSaveContent: () => ({ mutate: vi.fn(), isPending: false }),
  useReviewListings: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { EditDialog } = await import('./dialogs')

afterEach(() => {
  cleanup()
  s.role = 'owner'
  s.on = false
})

const listing = {
  id: 'l1',
  marketplace: 'amazon',
  content: { content: { title: 'Cotton kurta', bullets: ['Soft'], description: 'A kurta.' } },
} as unknown as ListingDetail

const rule = (resend = false) => {
  render(<EditDialog open onOpenChange={() => {}} listing={listing} etag='"v1"' onSaved={() => {}} resend={resend} />)
  return screen.getByTestId('edit-dialog-rule').textContent ?? ''
}

describe('EditDialog approval line (ADR-0031)', () => {
  it('says someone else approves while owner approval is off', () => {
    expect(rule()).toContain('someone else must approve it')
  })

  it('tells an owner with owner approval on that they can approve it themselves', () => {
    s.on = true
    const text = rule()
    expect(text).toContain('you can approve it yourself')
    expect(text).not.toContain('someone else')
  })

  it('the resend line names the marketplace and no teammate for that owner', () => {
    s.on = true
    const text = rule(true)
    expect(text).toContain('send it to Amazon again')
    expect(text).not.toContain('teammate')
  })

  it('a reviewer still hears that someone else approves, whatever the setting', () => {
    s.role = 'reviewer'
    s.on = true
    expect(rule()).toContain('someone else must approve it')
    cleanup()
    expect(rule(true)).toContain('a teammate approves it')
  })
})
