import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { columnHelper, DataTable, selectionColumn } from './data-table'

interface Row {
  id: string
  sku: string
}
const col = columnHelper<Row>()
const columns = col.columns([selectionColumn<Row>(), col.accessor('sku', { header: 'SKU' })])
const rows: Row[] = [
  { id: 'a', sku: 'KURTA-001' },
  { id: 'b', sku: 'KURTA-002' },
]

describe('DataTable', () => {
  it('renders rows, selection and Load more', () => {
    const onLoadMore = vi.fn()
    const onSel = vi.fn()
    render(
      <DataTable
        label="Products"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={onSel}
        hasMore
        onLoadMore={onLoadMore}
      />,
    )
    expect(screen.getByText('KURTA-001')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]!)
    expect(onSel).toHaveBeenCalledWith({ b: true })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).toHaveBeenCalled()
  })

  it('shows the empty state', () => {
    render(<DataTable label="x" columns={columns} data={[]} getRowId={(r) => r.id} empty={<p>No products yet</p>} />)
    expect(screen.getByText('No products yet')).toBeTruthy()
  })

  it('shows the error with its reference', () => {
    const error = new ApiError({ type: 'INTERNAL_ERROR', status: 500, message: 'x', correlationId: 'req-42' })
    render(<DataTable label="x" columns={columns} data={[]} getRowId={(r) => r.id} error={error} onRetry={() => {}} />)
    expect(screen.getByText('req-42')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
