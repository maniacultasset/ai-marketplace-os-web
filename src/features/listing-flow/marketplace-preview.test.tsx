import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListingDetail } from '@/features/listings/model'
import type { Product } from '@/features/products/api'
import { galleryOrder, previewModel } from './marketplace-preview-model'

vi.mock('@/features/products/image-views', async (orig) => ({
  ...(await orig<typeof import('@/features/products/image-views')>()),
  useRefreshProductViews: () => () => {},
}))

const { MarketplacePreviewDialog } = await import('./marketplace-preview')

afterEach(cleanup)

function listing(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: 'l1',
    product_id: 'p1',
    marketplace: 'amazon',
    status: 'validated',
    content: {
      product_id: 'p1',
      marketplace: 'amazon',
      category: 'ethnic_wear_kurta_sets',
      version: 2,
      content: { title: 'Indigo cotton kurta set', bullets: ['Soft cotton', 'Straight fit'], description: 'A cotton kurta set for daily wear.' },
      keywords: { search_terms: ['kurta', 'cotton kurta'], hidden_terms: ['ethnic'] },
      attributes: { fabric_type: 'Cotton', sleeve_count: 2 },
      images: [
        { image_id: 'i2', slot: 'secondary', position: 2 },
        { image_id: 'i3', slot: 'secondary', position: 1 },
        { image_id: 'i1', slot: 'main', position: 9 },
        { image_id: 'i4', slot: 'secondary', position: 3 },
      ],
    },
    ...over,
  } as ListingDetail
}

const product = {
  id: 'p1',
  brand_name: 'Kuinn Studio',
  selling_price: '999.00',
  mrp: '1299.00',
  currency: 'INR',
  size_run: ['S', 'M', 'L'],
  colourways: [{ id: 'c1', colour: 'Indigo', colour_sku: null }],
  variant_attributes: {},
  country_of_origin: 'India',
  image_details: [
    { image_id: 'i1', slot: 'main', view_url: 'https://img.test/1' },
    { image_id: 'i2', slot: 'secondary', view_url: 'https://img.test/2' },
    { image_id: 'i3', slot: 'secondary', view_url: 'https://img.test/3' },
  ],
} as unknown as Product

describe('marketplace preview model', () => {
  it('orders the gallery main first, then by position, and counts photos not checked yet', () => {
    expect(galleryOrder(listing().content!.images!).map((i) => i.image_id)).toEqual(['i1', 'i3', 'i2', 'i4'])
    const m = previewModel(listing(), product)
    expect(m.photos.map((p) => p.src)).toEqual(['https://img.test/1', 'https://img.test/3', 'https://img.test/2'])
    expect(m.photosMissing).toBe(1)
  })

  it('takes price, MRP, discount, sizes, colours and details from the product', () => {
    const m = previewModel(listing(), product)
    expect(m.price).toBe('₹999')
    expect(m.mrp).toBe('₹1,299')
    expect(m.discount).toBe(23)
    expect(m.sizes).toEqual(['S', 'M', 'L'])
    expect(m.colours).toEqual(['Indigo'])
    expect(m.details).toEqual([
      ['Brand', 'Kuinn Studio'],
      ['Fabric type', 'Cotton'],
      ['Sleeve count', '2'],
      ['Country of origin', 'India'],
    ])
    expect(m.searchTerms).toBe(3)
  })

  it('shows no strike-through when the MRP is the price, and no price without one', () => {
    expect(previewModel(listing(), { ...product, mrp: '999.00' }).mrp).toBeNull()
    const none = previewModel(listing(), { ...product, selling_price: null, mrp: null })
    expect(none.price).toBeNull()
    expect(none.discount).toBeNull()
  })

  it('picks a variant’s own size and colour', () => {
    const m = previewModel(listing(), { ...product, size_run: [], colourways: [], variant_attributes: { size: 'M', color: 'Blue' } })
    expect(m.picked).toEqual({ size: 'M', color: 'Blue' })
  })
})

describe('Preview on the marketplace', () => {
  it('lays out the complete Amazon listing and says it is an approximation', async () => {
    render(<MarketplacePreviewDialog open onOpenChange={() => {}} listing={listing()} product={product} />)
    const page = within(await screen.findByTestId('mp-preview-amazon'))
    expect(screen.getByText(/An approximation of how Amazon may show this listing/)).toBeTruthy()
    expect(page.getByTestId('mp-preview-title').textContent).toBe('Indigo cotton kurta set')
    expect(page.getByText('Visit the Kuinn Studio store')).toBeTruthy()
    expect(page.getByTestId('mp-preview-price').textContent).toContain('-23%')
    expect(page.getByTestId('mp-preview-price').textContent).toContain('M.R.P.: ₹1,299')
    expect(page.getByText('About this item')).toBeTruthy()
    expect(page.getAllByTestId('mp-preview-bullets')[0]!.textContent).toContain('Straight fit')
    expect(page.getByTestId('mp-preview-details').textContent).toContain('Fabric type')
    expect(page.getByTestId('mp-preview-description').textContent).toContain('daily wear')
    expect(page.getByTestId('mp-preview-hidden').textContent).toContain('3 terms are sent for search only')
    // the gallery: one thumbnail per checked photo; a click shows that one
    const thumbs = within(page.getByRole('group', { name: 'Photos' })).getAllByRole('button')
    expect(thumbs).toHaveLength(3)
    await userEvent.click(thumbs[2]!)
    expect(thumbs[2]!.getAttribute('aria-pressed')).toBe('true')
    // the size picker
    const sizes = within(page.getByRole('group', { name: 'Size' }))
    await userEvent.click(sizes.getByRole('button', { name: 'M' }))
    expect(sizes.getByText('M', { selector: 'b' })).toBeTruthy()
  })

  it('uses Flipkart’s layout: brand before the title, “% off”, highlights and specifications', async () => {
    render(<MarketplacePreviewDialog open onOpenChange={() => {}} listing={listing({ marketplace: 'flipkart' })} product={product} />)
    const page = within(await screen.findByTestId('mp-preview-flipkart'))
    expect(page.getByTestId('mp-preview-title').textContent).toBe('Kuinn Studio Indigo cotton kurta set')
    expect(page.getByTestId('mp-preview-price').textContent).toContain('23% off')
    expect(page.getByText('Highlights')).toBeTruthy()
    expect(page.getByText('Specifications')).toBeTruthy()
    expect(page.queryByText('About this item')).toBeNull()
  })

  it('says so when no photo is checked yet', async () => {
    render(<MarketplacePreviewDialog open onOpenChange={() => {}} listing={listing()} product={{ ...product, image_details: [] }} />)
    expect((await screen.findByTestId('mp-preview-no-photos')).textContent).toContain('still being checked')
  })
})
