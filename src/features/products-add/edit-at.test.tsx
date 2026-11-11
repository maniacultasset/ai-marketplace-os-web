import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarcodeField } from '@/features/products/barcode-field'
import { emptyBarcode, type BarcodeLevel } from '@/features/products/barcode'
import type { EditTarget } from './detail-tabs'
import { useEditAt } from './edit-at'

afterEach(cleanup)

/** The product page in small: Overview shows the editor's barcode field once editing starts. */
function Page({ edit, ready, canEdit, level = 'item', clear }: { edit?: EditTarget; ready: boolean; canEdit: boolean; level?: BarcodeLevel; clear: () => void }) {
  const [editing, setEditing] = useState(false)
  useEditAt({ edit, ready, canEdit, editing, tab: 'overview', start: () => setEditing(true), clear })
  return (
    <div>
      <button type="button">Other</button>
      {editing ? <BarcodeField id="e-barcode" level={level} value={emptyBarcode()} onChange={() => {}} /> : <p>Overview</p>}
    </div>
  )
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useEditAt (?edit=barcode on the product page)', () => {
  it('waits for the variants, then opens the editor, drops ?edit and focuses the digits', async () => {
    const clear = vi.fn()
    const { rerender, container } = render(<Page edit="barcode" ready={false} canEdit clear={clear} />)
    await flush()
    expect(clear).not.toHaveBeenCalled()
    expect(container.querySelector('[data-barcode-field]')).toBeNull()
    rerender(<Page edit="barcode" ready canEdit clear={clear} />)
    await flush()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.id).toBe('e-barcode-value')
    expect(document.activeElement?.closest('[data-barcode-field]')).toBeTruthy()
  })

  it('on a style focuses the chosen option of the barcode choice', async () => {
    render(<Page edit="barcode" ready canEdit level="style" clear={() => {}} />)
    await flush()
    const active = document.activeElement as HTMLInputElement
    expect(active.type).toBe('radio')
    expect(active.checked).toBe(true)
    expect(active.closest('[data-barcode-field]')).toBeTruthy()
  })

  it('without edit rights only drops ?edit: the page stays on Overview with no editor', async () => {
    const clear = vi.fn()
    const { container } = render(<Page edit="barcode" ready canEdit={false} clear={clear} />)
    await flush()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-barcode-field]')).toBeNull()
    expect(container.textContent).toContain('Overview')
  })

  it('does nothing without ?edit', async () => {
    const clear = vi.fn()
    const { container } = render(<Page ready canEdit clear={clear} />)
    await flush()
    expect(clear).not.toHaveBeenCalled()
    expect(container.querySelector('[data-barcode-field]')).toBeNull()
  })
})
