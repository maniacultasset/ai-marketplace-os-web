import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { gateCounts, gatesSummary, needsGates, onlyRecommended, rollUpGates, type ErrorItem } from './gates'
import { GateList, gateChip, gateWord } from './ui'
import { addOnProductLink, groupFindings, isRecommendation, recommendedHelp, recommendedKey } from './recommended'
import { editableAttrs } from '@/features/products/edit-model'
import { recommendedBy, recommendedText, type Requirements } from '@/features/products/needs'
import { detailSearch } from '@/features/products-add/detail-tabs'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...rest }: { to: string; params?: Record<string, string>; search?: Record<string, string>; children: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)
    return (
      <a href={search ? `${path}?${new URLSearchParams(search).toString()}` : path} {...rest}>
        {children}
      </a>
    )
  },
}))

const { FindingsCard } = await import('./findings-card')

afterEach(cleanup)

const card = (findings: ErrorItem[], productId: string | null) =>
  render(
    <TooltipProvider>
      <FindingsCard findings={findings} productId={productId} />
    </TooltipProvider>,
  )

const V1 = 'v1'

const item = (over: Partial<ErrorItem> = {}): ErrorItem => ({
  auto_fixable: false,
  error_code: 'MISSING_ATTRIBUTE',
  field: 'attributes.fabric_type',
  message: 'Required attribute fabric_type is missing',
  retryable: false,
  severity: 'error',
  source: 'rules_engine',
  ...over,
})

const rec = (key: string): ErrorItem =>
  item({ field: `attributes.${key}`, severity: 'warning', message: `Recommended attribute ${key} is missing`, rule_id: null })

const longTitle = item({ error_code: 'FIELD_TOO_LONG', field: 'content.title', severity: 'warning', message: 'Title is long', rule_id: 'r1' })

describe('isRecommendation', () => {
  it('needs the template warning: MISSING_ATTRIBUTE, warning, no rule, rules engine, an attribute', () => {
    expect(isRecommendation(rec('fit'))).toBe(true)
    expect(isRecommendation({ ...rec('fit'), severity: 'error' })).toBe(false)
    expect(isRecommendation({ ...rec('fit'), rule_id: 'r1' })).toBe(false)
    expect(isRecommendation({ ...rec('fit'), source: 'amazon_adapter' })).toBe(false)
    expect(isRecommendation({ ...rec('fit'), error_code: 'VALUE_NOT_ALLOWED' })).toBe(false)
    expect(isRecommendation({ ...rec('fit'), field: 'facts.fit' })).toBe(false)
  })
})

describe('groupFindings', () => {
  it('keeps blockers, recommendations and other warnings apart, one per attribute', () => {
    const blocker = item()
    const g = groupFindings([rec('fit'), blocker, longTitle, rec('pattern'), rec('fit')])
    expect(g.blocking).toEqual([blocker])
    expect(g.recommended.map(recommendedKey)).toEqual(['fit', 'pattern'])
    expect(g.warnings).toEqual([longTitle])
  })

  it('says what each attribute is, with a plain fallback', () => {
    expect(recommendedHelp('fit')).toMatch(/regular, relaxed or slim/)
    expect(recommendedHelp('something_new')).toBe('Shoppers use it to search and filter.')
  })

  it('links to the product editor on that field', () => {
    expect(addOnProductLink('p1', 'fit')).toEqual({ to: '/products/$productId', params: { productId: 'p1' }, search: { edit: 'fit' } })
    expect(detailSearch.parse({ edit: 'sleeve_length' })).toEqual({ edit: 'sleeve_length' })
    expect(detailSearch.parse({ edit: '../x' })).toEqual({})
  })
})

const validation = (errors: ErrorItem[]) => ({
  blocking_count: errors.filter((e) => e.severity === 'error').length,
  warning_count: errors.filter((e) => e.severity === 'warning').length,
  listing_id: 'l1',
  listing_version_id: V1,
  passed: !errors.some((e) => e.severity === 'error'),
  schema_version: '1',
  stages: [
    {
      attempt: 1,
      created_at: '2026-11-11T10:40:00Z',
      duration_ms: 12,
      listing_id: 'l1',
      listing_version_id: V1,
      source: 'rules_engine' as const,
      report: { attempts_used: 1, max_attempts: 3, retryable: false, schema_version: '1', status: 'passed' as const, errors },
    },
  ],
})

const gatesFor = (errors: ErrorItem[]) =>
  rollUpGates({
    listing: { status: 'validated', status_reason: null, marketplace_state: 'not_submitted', current_version_id: V1 },
    validation: validation(errors) as never,
    rules: [{ rule_type: 'required_attribute', field: 'attributes.color' }],
    preview: null,
    imageCount: 2,
  })

describe('gate counts', () => {
  it('a gate with only recommendations is not counted as a warning or a blocker', () => {
    const gates = gatesFor([rec('fit'), rec('pattern')])
    const attrs = gates.find((g) => g.id === 'attributes')!
    expect(attrs.state).toBe('warning')
    expect(attrs.note).toBe('2 recommended to add')
    expect(onlyRecommended(attrs)).toBe(true)
    const counts = gateCounts(gates)
    expect(counts).toMatchObject({ blocked: 0, warning: 0, recommended: 2 })
    expect(gatesSummary(counts)).toBe(`0 must fix · 2 recommended · ${counts.passed} passed · ${counts.unchecked} not checked yet`)
  })

  it('blockers, warnings and recommendations each keep their own count', () => {
    const gates = gatesFor([item(), rec('fit'), longTitle])
    const counts = gateCounts(gates)
    expect(counts).toMatchObject({ blocked: 1, warning: 1, recommended: 1 })
    expect(gatesSummary(counts)).toMatch(/^1 must fix · 1 to check · 1 recommended · /)
  })

  it('a gate mixing a warning and a recommendation names both and counts as a warning', () => {
    const color = item({ error_code: 'VALUE_NOT_ALLOWED', field: 'attributes.color', severity: 'warning', message: 'odd colour', rule_id: 'r2' })
    const gates = gatesFor([color, rec('fit')])
    const attrs = gates.find((g) => g.id === 'attributes')!
    expect(attrs.note).toBe('1 warning, 1 recommended to add')
    expect(gateCounts(gates)).toMatchObject({ warning: 1, recommended: 1 })
  })
})

describe('a gate with only recommendations', () => {
  it('reads as passed and never needs the seller', () => {
    const gates = gatesFor([rec('fit'), rec('pattern')])
    const attrs = gates.find((g) => g.id === 'attributes')!
    expect(gateChip(attrs)).toBe('live')
    expect(gateWord(attrs)).toBe('Passed')
    expect(needsGates(gates).map((g) => g.id)).not.toContain('attributes')
    render(
      <TooltipProvider>
        <GateList gates={gates} />
      </TooltipProvider>,
    )
    expect(screen.getByLabelText('Attributes: Passed. 2 recommended to add')).toBeTruthy()
  })

  it('a real warning beside a recommendation still needs the seller', () => {
    const color = item({ error_code: 'VALUE_NOT_ALLOWED', field: 'attributes.color', severity: 'warning', message: 'odd colour', rule_id: 'r2' })
    const gates = gatesFor([color, rec('fit')])
    const attrs = gates.find((g) => g.id === 'attributes')!
    expect(gateChip(attrs)).toBe('needs-you')
    expect(gateWord(attrs)).toBe('Warning')
    expect(needsGates(gates).map((g) => g.id)).toContain('attributes')
  })
})

describe('FindingsCard', () => {
  it('shows three separate groups and links each recommendation to the product field', () => {
    card([item(), rec('fit'), longTitle], 'p1')
    expect(within(screen.getByTestId('findings-blocking')).getByText(/Must fix before approval/)).toBeTruthy()
    const recs = screen.getByTestId('findings-recommended')
    expect(within(recs).getByText(/Recommended to add/)).toBeTruthy()
    expect(within(recs).getByText(/regular, relaxed or slim/)).toBeTruthy()
    expect(screen.getByTestId('recommended-add-fit').getAttribute('href')).toBe('/products/p1?edit=fit')
    expect(within(screen.getByTestId('findings-warnings')).getByText(/Other warnings/)).toBeTruthy()
  })

  it('shows a few recommendations and opens the rest on request', () => {
    const keys = ['fit', 'neckline', 'pattern', 'sleeve_length', 'kurta_type']
    card(keys.map(rec), 'p1')
    expect(screen.queryByTestId('findings-blocking')).toBeNull()
    expect(screen.queryByTestId('findings-warnings')).toBeNull()
    expect(screen.queryByTestId('recommended-add-kurta_type')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more recommendations' }))
    expect(screen.getByTestId('recommended-add-kurta_type')).toBeTruthy()
  })

  it('a card with warnings only calls them warnings', () => {
    card([longTitle], null)
    expect(within(screen.getByTestId('findings-warnings')).getByText(/^Warnings/)).toBeTruthy()
  })
})

describe('product editor fields for recommended attributes', () => {
  it('adds the category fields only for their category', () => {
    expect(editableAttrs(false, 'ethnic_wear_kurta_sets')).toContain('kurta_type')
    expect(editableAttrs(false, 'tshirts')).not.toContain('kurta_type')
    expect(editableAttrs(false, 'home_decor_lamps')).toEqual(expect.arrayContaining(['lamp_type', 'lamp_material', 'shade_material', 'light_source_type']))
    expect(editableAttrs(true, 'tshirts')).not.toContain('color')
    expect(editableAttrs(false, 'tshirts')).toEqual(['fabric_type', 'color', 'fit', 'neckline', 'sleeve_length', 'pattern', 'wash_care', 'iron_care'])
  })

  it('names the ticked marketplaces that recommend a field', () => {
    const req = {
      category: 'tshirts',
      amazon: [],
      flipkart: [],
      levels: { amazon: { fit: 'recommended', color: 'required' }, flipkart: { fit: 'optional' } },
    } as Requirements
    expect(recommendedBy('fit', req, ['amazon', 'flipkart'])).toEqual(['amazon'])
    expect(recommendedBy('fit', req, ['flipkart'])).toEqual([])
    expect(recommendedBy('color', req, ['amazon'])).toEqual([])
    expect(recommendedBy('fit', { ...req, levels: undefined } as unknown as Requirements, ['amazon'])).toEqual([])
    expect(recommendedText(['amazon', 'flipkart'])).toBe('Recommended for Amazon and Flipkart.')
    expect(recommendedText([])).toBeNull()
  })
})
