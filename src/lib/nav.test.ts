import { describe, expect, it } from 'vitest'
import { BUILT, CAPABILITIES } from '@/api/capabilities'
import { activeNavId, isNavActive, NAV_ITEMS, NAV_SECTIONS } from './nav'
import { ACTIONS, PLATFORM_ADMIN } from './permissions'

describe('nav registry', () => {
  it('has unique ids and paths', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length)
    expect(new Set(NAV_ITEMS.map((i) => i.to)).size).toBe(NAV_ITEMS.length)
  })
  it('puts every main item in a known section, in section order', () => {
    const main = NAV_ITEMS.filter((i) => i.placement === 'main')
    for (const i of main) expect(NAV_SECTIONS).toContain(i.section)
    const order = main.map((i) => NAV_SECTIONS.indexOf(i.section!))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
  it('gates every item on a real policy and capability', () => {
    for (const i of NAV_ITEMS) {
      expect(i.action === PLATFORM_ADMIN || (ACTIONS as readonly string[]).includes(i.action)).toBe(true)
      if (i.capability) expect(CAPABILITIES).toContain(i.capability)
    }
  })
  it('shows the sign-up queue to platform admins only', () => {
    expect(NAV_ITEMS.filter((i) => i.action === PLATFORM_ADMIN).map((i) => i.id)).toEqual(['signups'])
  })
  it('follows the hi-fi sidebar order', () => {
    expect(NAV_ITEMS.filter((i) => i.section === 'Main').map((i) => i.label)).toEqual([
      'Home',
      'Products',
      'Add products',
      'Inbox',
      'Marketplaces',
      'Activity',
      'Settings',
    ])
    expect(NAV_ITEMS.find((i) => i.id === 'inbox')?.capability).toBe('inbox')
    expect(NAV_ITEMS.find((i) => i.id === 'signups')?.capability).toBe('signups')
    expect(Object.keys(BUILT).sort()).toEqual([...CAPABILITIES].sort())
  })
  it('keeps a section highlighted on its sub-pages', () => {
    const settings = NAV_ITEMS.find((i) => i.id === 'settings')!
    expect(isNavActive(settings, '/team')).toBe(true)
    expect(isNavActive(settings, '/settings/autonomy')).toBe(true)
    expect(isNavActive(settings, '/settingsx')).toBe(false)
    const products = NAV_ITEMS.find((i) => i.id === 'products')!
    expect(isNavActive(products, '/listings/abc/review')).toBe(true)
  })
  it('highlights the most specific item', () => {
    expect(activeNavId(NAV_ITEMS, '/products/new')).toBe('add')
    expect(activeNavId(NAV_ITEMS, '/products/123')).toBe('products')
    expect(activeNavId(NAV_ITEMS, '/imports/new')).toBe('add')
    expect(activeNavId(NAV_ITEMS, '/imports/123')).toBe('products')
    expect(activeNavId(NAV_ITEMS, '/nowhere')).toBeNull()
  })
})
