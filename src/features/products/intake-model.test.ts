import { describe, expect, it } from 'vitest'
import {
  bodyErrorKey,
  compositionProblems,
  compositionRows,
  compositionTotal,
  compositionValue,
  discountPercent,
  emptyParty,
  emptySizeRow,
  formatMoney,
  fromPartyOut,
  fromSizeChart,
  moneyProblem,
  normalizeMoney,
  parseComposition,
  partyProblems,
  priceAboveMrp,
  sizeChartProblems,
  toPartyIn,
  toSizeChart,
  SIZE_CHART_REFUSED,
  type SizeChartDraft,
} from './intake-model'

describe('money', () => {
  it('normalizes what people type', () => {
    expect(normalizeMoney('₹1,299')).toBe('1299')
    expect(normalizeMoney(' Rs. 1 299.5 ')).toBe('1299.5')
    expect(normalizeMoney('01299')).toBe('1299')
    expect(normalizeMoney('1299.')).toBe('1299')
    expect(normalizeMoney('abc')).toBe('abc')
  })
  it('mirrors the backend Money rule', () => {
    expect(moneyProblem('', 'the MRP')).toBeNull()
    expect(moneyProblem('1299', 'the MRP')).toBeNull()
    expect(moneyProblem('1299.50', 'the MRP')).toBeNull()
    expect(moneyProblem('0', 'the MRP')).toMatch(/above ₹0/)
    expect(moneyProblem('0.00', 'the MRP')).toMatch(/above ₹0/)
    expect(moneyProblem('12.345', 'the MRP')).toMatch(/2 decimals/)
    expect(moneyProblem('-5', 'the MRP')).toMatch(/rupees/)
    expect(moneyProblem('12345678901', 'the MRP')).toMatch(/rupees/)
  })
  it('checks the selling price against the MRP exactly', () => {
    expect(priceAboveMrp('1299.01', '1299')).toBe(true)
    expect(priceAboveMrp('1299', '1299.00')).toBe(false)
    expect(priceAboveMrp('', '1299')).toBe(false)
    expect(discountPercent('999', '1299')).toBe(23)
    expect(discountPercent('1299', '1299')).toBeNull()
  })
  it('formats rupees', () => {
    expect(formatMoney('1299')).toBe('₹1,299')
    expect(formatMoney('1299.5')).toBe('₹1,299.50')
    expect(formatMoney('125000')).toBe('₹1,25,000')
    expect(formatMoney(null)).toBeNull()
  })
})

describe('composition', () => {
  it('parses both text forms like the backend', () => {
    const a = parseComposition('60% Cotton, 40% Polyester')
    const b = parseComposition('Cotton 60%, Polyester 40%')
    expect(a).toEqual({ ok: true, fibres: [{ fibre: 'Cotton', tenths: 600 }, { fibre: 'Polyester', tenths: 400 }] })
    expect(b).toEqual(a)
    expect(parseComposition('95% Cotton / 5% Elastane').ok).toBe(true)
    expect(parseComposition('50% cotton and 50% linen').ok).toBe(true)
    expect(parseComposition('100% Cotton').ok).toBe(true)
    expect(parseComposition('60.5% Cotton, 39.5% Silk').ok).toBe(true)
  })
  it('refuses what the backend refuses', () => {
    expect(parseComposition('59% Cotton, 40% Polyester')).toEqual({ ok: false, reason: 'sum' })
    expect(parseComposition('101% Cotton')).toEqual({ ok: false, reason: 'percent' })
    expect(parseComposition('0% Cotton, 100% Silk')).toEqual({ ok: false, reason: 'percent' })
    expect(parseComposition('50% Cotton, 50% cotton')).toEqual({ ok: false, reason: 'duplicate' })
    expect(parseComposition('50% , 50% Silk')).toEqual({ ok: false, reason: 'blank' })
    expect(parseComposition('Cotton')).toEqual({ ok: false, reason: 'format' })
    expect(parseComposition('60.55% Cotton, 39.45% Silk')).toEqual({ ok: false, reason: 'format' })
    expect(parseComposition('')).toEqual({ ok: false, reason: 'blank' })
  })
  it('round-trips builder rows', () => {
    const rows = [
      { fibre: ' Cotton ', percent: '60' },
      { fibre: 'Polyester', percent: '40%' },
      { fibre: '', percent: '' },
    ]
    expect(compositionProblems(rows)).toEqual({})
    expect(compositionValue(rows)).toBe('60% Cotton, 40% Polyester')
    expect(compositionRows('60% Cotton, 40% Polyester')).toEqual([
      { fibre: 'Cotton', percent: '60' },
      { fibre: 'Polyester', percent: '40' },
    ])
    expect(compositionRows(null, [{ fibre: 'cotton', percent: 100 }])).toEqual([{ fibre: 'Cotton', percent: '100' }])
  })
  it('explains row problems and the live total', () => {
    expect(compositionProblems([])).toEqual({})
    expect(compositionTotal([{ fibre: 'a', percent: '60.5' }, { fibre: 'b', percent: 'x' }])).toBe(605)
    expect(compositionProblems([{ fibre: 'Cotton', percent: '60' }])).toEqual({ total: expect.stringMatching(/add up to 60%/) })
    expect(compositionProblems([{ fibre: 'Cotton, Silk', percent: '100' }])['rows.0.fibre']).toMatch(/one fibre per row/)
    expect(compositionProblems([{ fibre: 'Cotton', percent: '50' }, { fibre: 'cotton', percent: '50' }])['rows.1.fibre']).toMatch(/Already listed/)
    expect(compositionProblems([{ fibre: '', percent: '100' }])['rows.0.fibre']).toBeDefined()
    expect(compositionProblems([{ fibre: 'Silk', percent: '150' }])['rows.0.percent']).toMatch(/1 to 100/)
  })
})

describe('size chart', () => {
  const draft = (rows: SizeChartDraft['rows']): SizeChartDraft => ({ unit: 'in', basis: 'garment', rows })
  it('builds the SizeChart body and skips blank rows', () => {
    const d = draft([{ ...emptySizeRow('S'), chest: '36', length: '44.5' }, emptySizeRow(), { ...emptySizeRow('M'), waist: '30' }])
    expect(sizeChartProblems(d)).toEqual({})
    expect(toSizeChart(d)).toEqual({ unit: 'in', basis: 'garment', rows: [{ size: 'S', chest: 36, length: 44.5 }, { size: 'M', waist: 30 }] })
    expect(toSizeChart(draft([emptySizeRow()]))).toBeNull()
  })
  it('needs at least one measurement per size (backend normalize_size_chart)', () => {
    const e = sizeChartProblems(draft([emptySizeRow('M')]))
    expect(e['size_chart.rows.0.size']).toMatch(/at least one measurement/)
  })
  it('allows at most one decimal in a measurement (backend _measure)', () => {
    expect(sizeChartProblems(draft([{ ...emptySizeRow('M'), chest: '34.25' }]))['size_chart.rows.0.chest']).toMatch(/one decimal/)
    expect(sizeChartProblems(draft([{ ...emptySizeRow('M'), chest: '34.5' }]))).toEqual({})
  })
  it('mirrors the backend limits', () => {
    const e = sizeChartProblems(draft([{ ...emptySizeRow('S'), chest: '0' }, { ...emptySizeRow('s'), waist: 'abc', hip: '30' }, { ...emptySizeRow(''), hip: '40' }]))
    expect(e['size_chart.rows.0.chest']).toMatch(/above 0/)
    expect(e['size_chart.rows.1.size']).toMatch(/already/)
    expect(e['size_chart.rows.1.waist']).toMatch(/number/)
    expect(e['size_chart.rows.2.size']).toMatch(/Enter the size/)
    expect(sizeChartProblems(draft([{ ...emptySizeRow('L'), chest: '501' }]))['size_chart.rows.0.chest']).toBeDefined()
    expect(sizeChartProblems(draft(Array.from({ length: 41 }, (_, i) => ({ ...emptySizeRow(`S${i}`), chest: '30' })))).size_chart).toMatch(/40/)
  })
  it('reads a stored chart back', () => {
    const d = fromSizeChart({ unit: 'cm', basis: 'body', rows: [{ size: 'M', chest: 96 }] })
    expect(d.unit).toBe('cm')
    expect(d.rows[0]).toEqual({ ...emptySizeRow('M'), chest: '96' })
  })
})

describe('party', () => {
  const good = { ...emptyParty(), legal_name: 'Asha Textiles Pvt Ltd', address_line1: '12 MG Road', city: 'Jaipur', state_code: 'RJ', postal_code: '302001' }
  it('validates like PartyIn', () => {
    expect(partyProblems(good)).toEqual({})
    const e = partyProblems({ ...emptyParty(), state_code: 'XX', postal_code: '012345', gstin: 'abc' })
    expect(Object.keys(e).sort()).toEqual(['address_line1', 'city', 'gstin', 'legal_name', 'postal_code', 'state_code'])
    expect(partyProblems({ ...good, gstin: '08abcde1234f1z5' })).toEqual({})
  })
  it('builds the body without blank optional fields', () => {
    expect(toPartyIn({ ...good, gstin: ' 08abcde1234f1z5 ' })).toEqual({
      legal_name: 'Asha Textiles Pvt Ltd',
      address_line1: '12 MG Road',
      city: 'Jaipur',
      state_code: 'RJ',
      postal_code: '302001',
      country_code: 'IN',
      gstin: '08ABCDE1234F1Z5',
    })
    expect(fromPartyOut({ id: 'x', legal_name: 'A', city: null, country_code: 'IN', inherited: true })).toEqual({ ...emptyParty(), legal_name: 'A' })
  })
})

describe('bodyErrorKey', () => {
  it('maps 422 locations onto form keys', () => {
    expect(bodyErrorKey(['body', 'mrp'])).toBe('mrp')
    expect(bodyErrorKey(['body', 'attributes', 'fabric_composition'])).toBe('attr.fiber_composition')
    expect(bodyErrorKey(['body', 'attributes', 'color'])).toBe('attr.color')
    expect(bodyErrorKey(['body', 'size_chart', 'rows', 2, 'chest'])).toBe('size_chart.rows.2.chest')
    expect(bodyErrorKey(['body', 'size_chart', 'rows', 2])).toBe('size_chart.rows.2.size')
    expect(bodyErrorKey(['body', 'size_chart', 'rows'])).toBe('size_chart')
    expect(bodyErrorKey(['body', 'manufacturer', 'postal_code'])).toBe('manufacturer.postal_code')
    expect(bodyErrorKey(['body', 'image_uploads', 0])).toBe('images')
    expect(bodyErrorKey(['body', 'mrp', 'function-after[_money()]'])).toBe('mrp')
    expect(bodyErrorKey(['header', 'If-Match'])).toBeNull()
  })
  it('explains a whole-chart refusal', () => {
    expect(SIZE_CHART_REFUSED).toMatch(/at least one measurement/)
  })
})
