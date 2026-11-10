import { describe, expect, it } from 'vitest'
import {
  COUNTRIES,
  countryName,
  countryProblem,
  emptyPackage,
  fromPackageOut,
  hsnProblem,
  packagePatch,
  packageProblems,
  packageText,
  suggestHsn,
  toPackageIn,
} from './seller-fields'

const pkg = (length = '', breadth = '', height = '', weight = '') => ({ length, breadth, height, weight })

describe('HSN', () => {
  it('takes 4, 6 or 8 digits', () => {
    expect(hsnProblem('')).toBeNull()
    expect(hsnProblem('6109')).toBeNull()
    expect(hsnProblem('610910')).toBeNull()
    expect(hsnProblem('61091000')).toBeNull()
    expect(hsnProblem('610')).toMatch(/4, 6 or 8 digits/)
    expect(hsnProblem('61a9')).toMatch(/4, 6 or 8 digits/)
  })
  it('suggests the reviewed heading for a listable category only', () => {
    expect(suggestHsn('tshirts')).toBe('6109')
    expect(suggestHsn('ethnic_wear_kurta_sets')).toBe('6204')
    expect(suggestHsn('kurtas')).toBeNull()
  })
})

describe('package', () => {
  it('needs all three sizes or none, each above 0 with at most 2 decimals', () => {
    expect(packageProblems(emptyPackage())).toEqual({})
    expect(packageProblems(pkg('30', '25', '3', '250'))).toEqual({})
    expect(packageProblems(pkg('30', '', '3'))).toEqual({ package: expect.stringMatching(/all three/) })
    expect(packageProblems(pkg('0', '25', '3'))['package.length']).toBeDefined()
    expect(packageProblems(pkg('30.125', '25', '3'))['package.length']).toBeDefined()
    expect(packageProblems(pkg('', '', '', '2.5'))['package.weight']).toBeDefined()
    expect(packageProblems(pkg('', '', '', '2000001'))['package.weight']).toBeDefined()
  })
  it('sends the size as a set and the weight on its own', () => {
    expect(toPackageIn(emptyPackage())).toBeNull()
    expect(toPackageIn(pkg('30', '25.5', '3', '250'))).toEqual({ length_cm: 30, breadth_cm: 25.5, height_cm: 3, weight_g: 250 })
    expect(toPackageIn(pkg('', '', '', '250'))).toEqual({ weight_g: 250 })
  })
  it('patches only what changed, and null clears all four', () => {
    const base = pkg('30', '25', '3', '250')
    expect(packagePatch(base, base)).toBeUndefined()
    expect(packagePatch(base, pkg('30', '25', '3', '300'))).toEqual({ weight_g: 300 })
    expect(packagePatch(base, pkg('31', '25', '3', '250'))).toEqual({ length_cm: 31, breadth_cm: 25, height_cm: 3 })
    expect(packagePatch(base, pkg('', '', '', '250'))).toEqual({ length_cm: null, breadth_cm: null, height_cm: null })
    expect(packagePatch(base, emptyPackage())).toBeNull()
    expect(packagePatch(emptyPackage(), pkg('', '', '', '90'))).toEqual({ weight_g: 90 })
  })
  it('reads and prints the saved package', () => {
    const out = { length_cm: '30.00', breadth_cm: 25, height_cm: '3.5', weight_g: 1250 }
    expect(fromPackageOut(out)).toEqual(pkg('30', '25', '3.5', '1250'))
    expect(packageText(out)).toBe('30 × 25 × 3.5 cm · 1,250 g')
    expect(packageText({ weight_g: 90 })).toBe('90 g')
    expect(packageText(null)).toBe('')
  })
})

describe('country', () => {
  it('takes a two-letter code and names it', () => {
    expect(countryProblem('')).toBeNull()
    expect(countryProblem('IN')).toBeNull()
    expect(countryProblem('IND')).toMatch(/Choose a country/)
    expect(countryName('in')).toBe('India')
    expect(countryName('ZZ')).toBe('ZZ')
  })

  it('offers every assigned ISO 3166 code once, India first, and refuses an unassigned one', () => {
    expect(COUNTRIES).toHaveLength(249)
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(249)
    expect(COUNTRIES[0]).toEqual({ code: 'IN', name: 'India' })
    const rest = COUNTRIES.slice(1).map((c) => c.name)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')))
    expect(countryName('fr')).toBe('France')
    expect(countryProblem('fr')).toBeNull()
    for (const bad of ['XX', 'UK', 'EU']) expect(countryProblem(bad)).toMatch(/Choose a country/)
  })
})
