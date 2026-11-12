import { describe, expect, it } from 'vitest'
import {
  COUNTRIES,
  countryName,
  countryProblem,
  emptyPackage,
  fromPackageOut,
  hsnProblem,
  packageLimitProblems,
  packagePatch,
  packageProblems,
  packageText,
  packageWarnings,
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

describe('package plausibility (item 15)', () => {
  it('stays quiet for a sensible box and for an empty or invalid one', () => {
    expect(packageWarnings(pkg('30', '25', '3', '250'), 'tshirts')).toEqual({})
    expect(packageWarnings(pkg('35', '28', '0.5', '600'), 'ethnic_wear_kurta_sets')).toEqual({})
    expect(packageWarnings(pkg('40', '40', '60', '3500'), 'home_decor_lamps')).toEqual({})
    expect(packageWarnings(emptyPackage(), 'tshirts')).toEqual({})
    expect(packageWarnings(pkg('300', '', '3', '2.5'), 'tshirts')).toEqual({})
  })
  it('names the likely meaning of a unit slip', () => {
    expect(packageWarnings(pkg('', '', '', '25000'), 'tshirts')).toEqual({ weight: 'This box weighs 25 kg. Did you mean 25 g?' })
    expect(packageWarnings(pkg('', '', '', '3'), 'home_decor_lamps')).toEqual({ weight: 'This box weighs 3 g. Did you mean 3 kg (3,000 g)?' })
    expect(packageWarnings(pkg('140', '120', '30'), 'tshirts')).toEqual({ size: 'A 140 cm side is 1.4 m long. Did you mean 140 mm (14 cm)?' })
    expect(packageWarnings(pkg('0.4', '0.4', '0.6'), 'home_decor_lamps')).toEqual({ size: 'A 0.4 cm side is very thin. Did you mean 0.4 m (40 cm)?' })
  })
  it('asks to check an absurd box with no likely slip', () => {
    expect(packageWarnings(pkg('', '', '', '12345'), 'tshirts').weight).toBe('This box weighs 12.35 kg, which is heavy for clothing. Check the weight.')
    expect(packageWarnings(pkg('', '', '', '40'), 'home_decor_lamps').weight).toBe('This box weighs only 40 g, which is light for a lamp. Check the weight.')
    expect(packageWarnings(pkg('99999.99', '20', '2'), '').size).toBe('A 99,999.99 cm side is 1,000 m long, which is large. Check the size.')
  })
  it('refuses a box past the category\'s hard limit (bullet 4), with the allowed range, and warns no more', () => {
    expect(packageLimitProblems(pkg('', '', '', '31000'), 'ethnic_wear_kurta_sets')).toEqual({
      'package.weight': 'A packed box for clothing weighs between 20 g and 30 kg. Check the weight is the box in grams.',
    })
    expect(packageLimitProblems(pkg('', '', '', '30000'), 'ethnic_wear_kurta_sets')).toEqual({})
    expect(packageLimitProblems(pkg('151', '20', '2'), 'tshirts')).toEqual({
      'package.length': 'A packed box for clothing has each side between 0.3 and 150 cm. Check the size is the box in cm.',
    })
    expect(packageWarnings(pkg('151', '20', '2', '500000'), 'tshirts')).toEqual({})
    expect(Object.keys(packageLimitProblems(pkg('301', '40', '40', '100001'), 'home_decor_lamps'))).toEqual(['package.length', 'package.weight'])
    expect(packageLimitProblems(pkg('2000', '40', '40', '500000'), 'kitchen')).toEqual({})
    expect(packageLimitProblems(pkg('300', '', '3', '2.5'), 'tshirts')).toEqual({}) // an invalid draft has its own errors
  })
  it('checks the product itself with the same rules, keyed item.*', () => {
    expect(packageProblems(pkg('30', '', '', '0'), 'item')).toEqual({
      item: 'Enter all three sizes (length, breadth and height), or none.',
      'item.weight': 'Enter the weight in whole grams, from 1 to 20,00,000.',
    })
    expect(packageProblems(pkg('30', '15', '12.5', '420'), 'item')).toEqual({})
  })
  it('uses a wide range for any other category', () => {
    expect(packageWarnings(pkg('250', '40', '40', '60000'), 'kitchen')).toEqual({})
    expect(Object.keys(packageWarnings(pkg('2000', '40', '40', '500000'), ''))).toEqual(['size', 'weight'])
  })
})
