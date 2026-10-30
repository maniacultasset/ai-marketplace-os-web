import { describe, expect, it } from 'vitest'
import { domainHint, isConsumerEmail, ownerNameFrom, registrableLabel, suggestBrandName } from './prefill'

describe('Google sign-up prefill', () => {
  it.each([
    ['meera@gmail.com', ''],
    ['meera@googlemail.com', ''],
    ['meera@yahoo.co.in', ''],
    ['meera@outlook.in', ''],
    ['meera@hotmail.co.uk', ''],
    ['meera@icloud.com', ''],
    ['meera@proton.me', ''],
    ['meera@rediffmail.com', ''],
    ['meera@acmenaturals.com', 'Acmenaturals'],
    ['meera@acme-naturals.in', 'Acme Naturals'],
    ['meera@mail.kalakar_weaves.co.in', 'Kalakar Weaves'],
    ['meera@team.acme.com', 'Acme'],
    ['meera@123.com', ''],
    ['meera@xn--h2brj9c.in', ''],
    ['meera@localhost', ''],
  ])('%s suggests %j', (email, brand) => {
    expect(suggestBrandName(email)).toBe(brand)
  })

  it('never splits a label without an explicit break (no invented words)', () => {
    expect(suggestBrandName('a@bluelotusfoods.com')).toBe('Bluelotusfoods')
  })

  it('reads the registrable label under two-part suffixes', () => {
    expect(registrableLabel('shop.acme.co.in')).toBe('acme')
    expect(registrableLabel('acme.com')).toBe('acme')
    expect(registrableLabel('com')).toBeNull()
  })

  it('treats personal mailboxes as consumer and offers no website hint for them', () => {
    expect(isConsumerEmail('x@gmail.com')).toBe(true)
    expect(isConsumerEmail('x@acme.com')).toBe(false)
    expect(domainHint('x@gmail.com')).toBeNull()
    expect(domainHint('x@Acme.com')).toBe('acme.com')
  })

  it('takes the owner name from the given and family name, else the display name', () => {
    expect(ownerNameFrom({ given_name: 'Meera', family_name: 'Iyer', display_name: 'M I' })).toBe('Meera Iyer')
    expect(ownerNameFrom({ given_name: 'Meera', family_name: null, display_name: 'x' })).toBe('Meera')
    expect(ownerNameFrom({ display_name: '  Meera   Iyer ' })).toBe('Meera Iyer')
    expect(ownerNameFrom({})).toBe('')
    expect(ownerNameFrom({ display_name: 'x'.repeat(500) }).length).toBe(200)
  })
})
