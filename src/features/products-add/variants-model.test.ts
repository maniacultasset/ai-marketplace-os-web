import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv-header'
import { buildFamilyCsv, buildVariants, cellKey, colourCode, colourProblem, emptyVariants, gtinProblem, gtinValid, sizeProblem, validateVariants, variantSku } from './variants-model'

describe('variant SKUs', () => {
  it('builds codes like the design', () => {
    expect(colourCode('Black')).toBe('BLK')
    expect(colourCode('White')).toBe('WHT')
    expect(colourCode('Red')).toBe('RED')
    expect(colourCode('Blue')).toBe('BLU')
    expect(colourCode('Maroon')).toBe('MRN')
    expect(colourCode('Off white')).toBe('OFW')
    expect(colourCode('Navy blue melange')).toBe('NBM')
    expect(variantSku('FSH-TEE-001', 'Off white', 'XL')).toBe('FSH-TEE-001-OFW-XL')
    expect(variantSku('FSH-TEE-001', null, 'Free size')).toBe('FSH-TEE-001-FREESIZE')
  })
})

describe('matrix', () => {
  const s = { ...emptyVariants(), colours: ['Black', 'Off white'], sizes: ['S', 'M', 'L', 'XL'], unavailable: [cellKey('Off white', 'XL')] }
  it('makes every listed combination except the ones not made', () => {
    const rows = buildVariants('FSH', s)
    expect(rows).toHaveLength(7)
    expect(rows.some((r) => r.colour === 'Off white' && r.size === 'XL')).toBe(false)
  })
  it('makes none without colours or sizes, and size-only families', () => {
    expect(buildVariants('FSH', emptyVariants())).toEqual([])
    expect(buildVariants('FSH', { ...emptyVariants(), sizes: ['S'] }).map((r) => r.sku)).toEqual(['FSH-S'])
  })

  it('validates money, price above MRP, GTIN and duplicate SKUs', () => {
    const k = cellKey('Black', 'S')
    const e = validateVariants('FSH', {
      ...s,
      commercial: { [k]: { mrp: '₹ 799', price: '999', identifier: '1234' } },
      skus: { [cellKey('Black', 'M')]: 'FSH-BLK-S' },
    })
    expect(e[`${k}.price`]).toMatch(/above the MRP/)
    expect(e[`${k}.identifier`]).toBeDefined()
    expect(e[`${cellKey('Black', 'M')}.sku`]).toMatch(/twice/)
    expect(validateVariants('FSH', { ...s, sizes: ['S', 'Extra Large!'] }).sizes).toBeDefined()
  })

  it('checks GS1 check digits', () => {
    expect(gtinValid('4006381333931')).toBe(true)
    expect(gtinValid('4006381333932')).toBe(false)
    expect(gtinValid('96385074')).toBe(true)
  })
})

describe('buildFamilyCsv', () => {
  it('writes the style row then one child row per variant naming it', () => {
    const k = cellKey('Black', 'S')
    const text = buildFamilyCsv(
      { sku: 'FSH-TEE-001', title: 'Relaxed, Cotton "Tee"', category: 'tshirts' },
      { ...emptyVariants(), colours: ['Black'], sizes: ['S', 'M'], commercial: { [k]: { mrp: '₹ 1,299', price: '999.50', identifier: '4006381333931' } } },
    )
    const rows = parseCsv(text)
    expect(rows[0]).toContain('parent_style_id')
    expect(rows[1]!.slice(0, 4)).toEqual(['FSH-TEE-001', '', 'Relaxed, Cotton "Tee"', 'tshirts'])
    expect(rows[1]![6]).toBe('alpha')
    expect(rows[2]).toEqual(['FSH-TEE-001-BLK-S', 'FSH-TEE-001', 'Relaxed, Cotton "Tee"', 'tshirts', 'Black', 'S', '', '1299', '999.50', 'gtin', '4006381333931'])
    expect(rows[3]![0]).toBe('FSH-TEE-001-BLK-M')
    expect(rows).toHaveLength(4)
  })
})

describe('field checks', () => {
  it('needs letters in a colour name, but allows digits beside them', () => {
    expect(colourProblem('12345')).toMatch(/with letters/)
    expect(colourProblem('#$%')).toMatch(/with letters/)
    for (const c of ['Black', 'Off white', 'Navy-blue', 'Pantone 19-4052', 'लाल', 'Rose’s pink']) expect(colourProblem(c)).toBeNull()
    expect(colourProblem('a'.repeat(65))).toMatch(/64 characters or fewer/)
  })

  it('checks sizes like the import', () => {
    for (const z of ['S', 'XL', '32', 'Free size', '3/4', '10.5', 'UK 8+']) expect(sizeProblem(z)).toBeNull()
    expect(sizeProblem('Extra Large!')).toMatch(/can’t be used as a size/)
    expect(sizeProblem('-S')).toBeDefined()
    expect(sizeProblem('x'.repeat(33))).toMatch(/32 characters or fewer/)
  })

  it('explains money and GTIN problems', () => {
    const k = cellKey('Black', 'S')
    const base = { ...emptyVariants(), colours: ['Black'], sizes: ['S'] }
    const err = (c: { mrp?: string; price?: string; identifier?: string }) =>
      validateVariants('FSH', { ...base, commercial: { [k]: { mrp: '', price: '', identifier: '', ...c } } })
    expect(err({ mrp: 'abc' })[`${k}.mrp`]).toMatch(/Use numbers for the MRP/)
    expect(err({ price: '0' })[`${k}.price`]).toMatch(/above zero/)
    expect(err({ price: '12.345' })[`${k}.price`]).toMatch(/at most 2 decimals/)
    expect(err({ mrp: '₹1,299', price: '999.50' })).toEqual({})
    expect(gtinProblem('')).toBeNull()
    expect(gtinProblem('40063813339A1')).toMatch(/digits only/)
    expect(gtinProblem('1234')).toMatch(/8, 12, 13 or 14 digits/)
    expect(gtinProblem('4006381333932')).toMatch(/check\) digit/)
    expect(gtinProblem('4006381333931')).toBeNull()
  })

  it('flags a variant that reuses the style SKU', () => {
    const k = cellKey('', 'S')
    expect(validateVariants('FSH', { ...emptyVariants(), sizes: ['S'], skus: { [k]: 'FSH' } })[`${k}.sku`]).toMatch(/style’s own SKU/)
  })
})
