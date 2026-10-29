import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeField, SetupKey } from './components'

function Harness({ onSubmit, canAutoSubmit = true, error }: { onSubmit: (v: string) => void; canAutoSubmit?: boolean; error?: string }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value)
      }}
    >
      <CodeField id="code" kind="totp" value={value} onChange={setValue} canAutoSubmit={canAutoSubmit} error={error} />
      <button type="submit">Verify</button>
    </form>
  )
}

const slots = () => [...document.querySelectorAll('[data-slot="otp-slot"]')].map((s) => s.textContent)

describe('CodeField (TOTP slots)', () => {
  afterEach(cleanup)

  it('is one labelled input with the one-time-code attributes; the slots are hidden from assistive tech', () => {
    render(<Harness onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('6-digit code')
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('name')).toBe('one-time-code')
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('pattern')).toBe('[0-9]*')
    expect(input.getAttribute('maxlength')).toBe('6')
    expect(input.getAttribute('aria-describedby')).toContain('code-hint')
    expect(document.querySelector('[data-slot="otp-slot"]')!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(slots()).toHaveLength(6)
  })

  it('typing fills the slots in order, keeps digits only, and never submits on its own', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.type(input, '12a3')
    expect(input.value).toBe('123')
    expect(slots()).toEqual(['1', '2', '3', '', '', ''])
    await user.type(input, '456')
    expect(input.value).toBe('123456')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('backspace removes the last digit', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.type(input, '1234')
    await user.type(input, '{Backspace}')
    expect(input.value).toBe('123')
    expect(slots()).toEqual(['1', '2', '3', '', '', ''])
  })

  it('a pasted full code (spaces dropped) submits the form exactly once', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.click(input)
    await user.paste(' 123 456 ')
    expect(input.value).toBe('123456')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith('123456')
    // Pasting the same code again does not submit it a second time.
    await user.paste('123456')
    await new Promise((r) => setTimeout(r, 20))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('a pasted code does not submit while auto-submit is off (busy or waiting)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} canAutoSubmit={false} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.click(input)
    await user.paste('654321')
    expect(input.value).toBe('654321')
    await new Promise((r) => setTimeout(r, 20))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a partial paste appends digits without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.type(input, '12')
    await user.paste('3-4')
    expect(input.value).toBe('1234')
    await new Promise((r) => setTimeout(r, 20))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a pasted number longer than a code fills the slots but never submits', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByLabelText('6-digit code') as HTMLInputElement
    await user.click(input)
    await user.paste('+91 98765 43210')
    expect(input.value).toBe('919876')
    await new Promise((r) => setTimeout(r, 20))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('marks only the real input invalid on an error', () => {
    render(<Harness onSubmit={vi.fn()} error="That code didn't work. Check it and try again." />)
    const invalid = document.querySelectorAll('[aria-invalid="true"]')
    expect(invalid).toHaveLength(1)
    expect(invalid[0]).toBe(screen.getByLabelText('6-digit code'))
  })
})

describe('SetupKey', () => {
  afterEach(cleanup)
  it('keeps the grouped text exactly, four characters a group', () => {
    render(<SetupKey secret="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" />)
    expect(screen.getByTestId('mfa-secret').textContent).toBe('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
  })
})
