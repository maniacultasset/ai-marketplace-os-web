import { describe, expect, it } from 'vitest'
import { WEBSITE_MAX, websiteProblem, websiteValue } from './website-model'

describe('website rule (mirrors the backend sign-up pattern)', () => {
  it('is optional: empty or blank is fine and clears', () => {
    expect(websiteProblem('')).toBeNull()
    expect(websiteProblem('   ')).toBeNull()
    expect(websiteValue('  ')).toBeNull()
  })

  it('accepts an http(s) link and trims it', () => {
    expect(websiteProblem('https://kalakar.in')).toBeNull()
    expect(websiteProblem('http://kalakar.in/shop?x=1')).toBeNull()
    expect(websiteValue('  https://kalakar.in  ')).toBe('https://kalakar.in')
  })

  it.each(['kalakar.in', 'www.kalakar.in', 'ftp://kalakar.in', 'HTTPS://kalakar.in'])('asks for https:// on %s', (v) => {
    expect(websiteProblem(v)).toMatch(/^Start with https:\/\//)
  })

  it.each(['https://localhost', 'https://kalakar in.in', 'https://'])('refuses %s', (v) => {
    expect(websiteProblem(v)).toMatch(/full web address/)
  })

  it('refuses more than the column holds', () => {
    const long = 'https://kalakar.in/' + 'a'.repeat(WEBSITE_MAX)
    expect(websiteProblem(long)).toMatch(/2,000 characters/)
  })
})
