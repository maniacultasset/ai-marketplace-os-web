import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  switchTenant: vi.fn(),
  createBrand: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => m.navigate }))
vi.mock('@/lib/auth', () => ({ switchTenant: m.switchTenant }))
vi.mock('./add-brand', async (importOriginal) => ({ ...(await importOriginal<typeof import('./add-brand')>()), createBrand: m.createBrand }))

const { AddBrandDialog } = await import('./add-brand-dialog')

const NEW = { id: '0b1c2d3e-0000-4000-8000-000000000002', name: 'Kalakar Home', slug: 'kalakar-home', status: 'trial', role: 'owner' }

function open(onClose = vi.fn()) {
  render(<AddBrandDialog open onClose={onClose} />)
  return onClose
}

function fill(name: string, website = '') {
  fireEvent.input(screen.getByTestId('add-brand-name'), { target: { value: name } })
  if (website) fireEvent.input(screen.getByTestId('add-brand-website'), { target: { value: website } })
  fireEvent.click(screen.getByTestId('add-brand-submit'))
}

beforeEach(() => {
  m.navigate.mockReset()
  m.switchTenant.mockReset()
  m.createBrand.mockReset()
})
afterEach(cleanup)

describe('AddBrandDialog', () => {
  it('adds the brand, switches into it and starts its setup', async () => {
    m.createBrand.mockResolvedValue(NEW)
    m.switchTenant.mockResolvedValue({})
    const onClose = open()
    fill('  Kalakar Home ', 'kalakar.in')
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith({ to: '/setup/brand' }))
    expect(m.createBrand).toHaveBeenCalledTimes(1)
    const [body, key] = m.createBrand.mock.calls[0]!
    expect(body).toEqual({ name: 'Kalakar Home', website: 'https://kalakar.in' })
    expect(typeof key).toBe('string')
    expect(m.switchTenant).toHaveBeenCalledWith(NEW.id, { quiet: true })
    expect(onClose).toHaveBeenCalled()
  })

  it('asks for a name before sending anything', async () => {
    open()
    fill('')
    expect(await screen.findByText('Enter the brand name.')).toBeTruthy()
    expect(m.createBrand).not.toHaveBeenCalled()
  })

  it('shows the rule a refusal names and keeps the form, then retries with the same key', async () => {
    m.createBrand.mockRejectedValueOnce(
      new ApiError({ type: 'PERMISSION_DENIED', status: 403, message: 'You own the most brands allowed. Contact support to add more.' }),
    )
    open()
    fill('Kalakar Home')
    expect((await screen.findByTestId('add-brand-error')).textContent).toContain('most brands allowed')
    expect(m.switchTenant).not.toHaveBeenCalled()
    m.createBrand.mockResolvedValueOnce(NEW)
    m.switchTenant.mockResolvedValue({})
    fireEvent.click(screen.getByTestId('add-brand-submit'))
    await waitFor(() => expect(m.navigate).toHaveBeenCalled())
    expect(m.createBrand.mock.calls[1]![1]).toBe(m.createBrand.mock.calls[0]![1])
  })

  it('puts a server field error on its field', async () => {
    m.createBrand.mockRejectedValue(
      new ApiError({
        type: 'VALIDATION_FAILED',
        status: 422,
        message: 'x',
        details: [{ loc: ['body', 'website'], msg: 'Enter a full address.' }],
      }),
    )
    open()
    fill('Kalakar Home', 'kalakar.in')
    expect(await screen.findByText('Enter a full address.')).toBeTruthy()
    expect(screen.queryByTestId('add-brand-error')).toBeNull()
  })

  it('says the brand exists when the switch fails, and retries only the switch', async () => {
    m.createBrand.mockResolvedValue(NEW)
    m.switchTenant.mockRejectedValueOnce(new ApiError({ type: 'NOT_FOUND', status: 404, message: 'x' }))
    const onClose = open()
    fill('Kalakar Home')
    expect((await screen.findByTestId('add-brand-error')).textContent).toContain('Kalakar Home is added')
    expect(m.navigate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // the form is gone, so nothing can change the body under the same key
    expect(screen.queryByTestId('add-brand-name')).toBeNull()
    expect(screen.getByTestId('add-brand-submit').textContent).toBe('Open brand')
    m.switchTenant.mockResolvedValueOnce({})
    fireEvent.click(screen.getByTestId('add-brand-submit'))
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith({ to: '/setup/brand' }))
    expect(m.createBrand).toHaveBeenCalledTimes(1)
    expect(m.switchTenant).toHaveBeenCalledTimes(2)
    expect(m.switchTenant.mock.calls[1]).toEqual([NEW.id, { quiet: true }])
  })
})
