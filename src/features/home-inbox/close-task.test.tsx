import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

const calls = vi.hoisted(() => ({ list: [] as { path: string; body: unknown; key: string | undefined }[], fail: null as unknown }))
vi.mock('@/api/client', () => ({
  api: {
    POST: async (path: string, init: { body: unknown; params: { header: Record<string, string> } }) => {
      calls.list.push({ path, body: init.body, key: init.params.header['Idempotency-Key'] })
      if (calls.fail) throw calls.fail
      return { data: { id: 't1', status: 'applied', resolution: 'done' }, response: new Response() }
    },
  },
  unwrap: async (p: Promise<{ data: unknown }>) => (await p).data,
}))
vi.mock('@/lib/auth', () => ({ useSession: () => ({ tenantId: 't' }) }))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { CloseTaskActions } = await import('./close-task')
const { closeRefusal, supportsClose } = await import('./close-task-api')

afterEach(() => {
  cleanup()
  calls.list = []
  calls.fail = null
})

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CloseTaskActions task={{ id: 't1', status: 'open', resolution: null }} />
    </QueryClientProvider>,
  )

describe('CloseTaskActions', () => {
  it('marks an account task done with an Idempotency-Key', async () => {
    setup()
    await userEvent.click(screen.getByTestId('task-mark-done'))
    await waitFor(() => expect(calls.list).toHaveLength(1))
    expect(calls.list[0]).toMatchObject({ path: '/tasks/{task_id}/close', body: { resolution: 'done' } })
    expect(calls.list[0]!.key).toMatch(/^[\x21-\x7E]{1,255}$/)
  })

  it('explains a refusal inline', async () => {
    calls.fail = new ApiError({ type: 'INVALID_STATUS_TRANSITION', status: 409, message: 'x' })
    setup()
    await userEvent.click(screen.getByTestId('task-dismiss'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/already closed/)).toBeTruthy()
  })
})

describe('close task model', () => {
  it('is offered only by a backend that sends resolution', () => {
    expect(supportsClose({ resolution: null })).toBe(true)
    expect(supportsClose({})).toBe(false)
  })
  it('words each refusal', () => {
    expect(closeRefusal(new ApiError({ type: 'VALIDATION_FAILED', status: 422, message: 'x' }))).toMatch(/closes on its own/)
  })
})
