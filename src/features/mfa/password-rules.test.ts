import { describe, expect, it } from 'vitest'
import { checkPassword, fold, personalTokens, RULE_ORDER } from './password-rules'

const who = { email: 'meera.iyer@acme.test', displayName: 'Meera Iyer' }

describe('checkPassword (mirrors core/password_policy.py check)', () => {
  it('passes a compliant password', () => {
    expect(checkPassword('Tulip-Rain-2026', who)).toEqual([])
  })

  it('reports every broken rule in the server order', () => {
    expect(checkPassword('', who)).toEqual(['length', 'upper', 'lower', 'digit', 'symbol'])
    expect(checkPassword('short', who)).toEqual(['length', 'upper', 'digit', 'symbol'])
    expect(RULE_ORDER).toEqual(['length', 'upper', 'lower', 'digit', 'symbol', 'personal'])
  })

  it('needs 12 to 1024 code points of the raw value', () => {
    expect(checkPassword('Abcdefgh-12', who)).toEqual(['length'])
    expect(checkPassword('Abcdefgh-123', who)).toEqual([])
    // An astral character is one code point (Python len), not two UTF-16 units.
    expect(checkPassword('Abcdefgh-1😀', who)).toEqual(['length'])
    expect(checkPassword(`Aa1-${'x'.repeat(1021)}`, who)).toEqual(['length'])
    expect(checkPassword(`Aa1-${'x'.repeat(1020)}`, who)).toEqual([])
  })

  it('checks each composition rule on its own', () => {
    expect(checkPassword('tulip-rain-2026', who)).toEqual(['upper'])
    expect(checkPassword('TULIP-RAIN-2026', who)).toEqual(['lower'])
    expect(checkPassword('Tulip-Rain-Moon', who)).toEqual(['digit'])
    expect(checkPassword('TulipRain2026x', who)).toEqual(['symbol'])
  })

  it('counts a space as a symbol, and non-ASCII letters and digits as letters and digits', () => {
    expect(checkPassword('Tulip Rain 2026', who)).toEqual([])
    // Devanagari digits are decimal digits (Nd); accented letters are letters.
    expect(checkPassword('Éclair-Tarte-२०२६', who)).toEqual([])
    // A combining mark is part of a letter, not a symbol.
    expect(checkPassword('TulipéRain2026', who)).toEqual(['symbol'])
  })

  it('refuses the email local part and any 3+ letter run of the name or local part', () => {
    expect(checkPassword('Meera.Iyer-2026!', who)).toEqual(['personal'])
    expect(checkPassword('Xx-IYER-2026-yy', who)).toEqual(['personal'])
    expect(checkPassword('Tulip-meera-2026', { email: 'meera@acme.test' })).toEqual(['personal'])
    // Two-letter runs are allowed.
    expect(checkPassword('Tulip-Al-2026!', { email: 'al@acme.test', displayName: 'Al' })).toEqual([])
  })

  it('folds case and compatibility forms before the name check (NFKC, casefold)', () => {
    expect(checkPassword('Tulip-ＭＥＥＲＡ-2026', who)).toEqual(['personal'])
    expect(fold('Straße')).toBe('strasse')
    expect(checkPassword('Tulip-STRASSE-26', { email: 'x@acme.test', displayName: 'Straße' })).toEqual(['personal'])
  })
})

describe('personalTokens', () => {
  it('takes the local part (3+) and letter runs (3+) of the local part and display name', () => {
    expect([...personalTokens('meera.iyer@acme.test', 'Meera K Iyer')].sort()).toEqual(['iyer', 'meera', 'meera.iyer'])
    expect([...personalTokens('ab@acme.test', null)]).toEqual([])
  })
})
