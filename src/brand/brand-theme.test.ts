// The brand theme reference (theme.ts) must say what the stylesheets apply: a value changed in one
// place and not the other fails here.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOR, MARKETING, RADIUS } from './theme'

const ROOT = resolve(__dirname, '../..')
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8') + readFileSync(join(ROOT, 'src/styles/landing.css'), 'utf8')
const kebab = (k: string) => k.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()

describe('brand theme', () => {
  it('matches every product colour token in index.css', () => {
    for (const [k, v] of Object.entries(COLOR)) expect(token(kebab(k)), k).toBe(v)
  })

  it('matches every marketing token in landing.css', () => {
    for (const [k, v] of Object.entries(MARKETING)) expect(token(kebab(k)), k).toBe(v)
  })

  it('matches the radii', () => {
    for (const [k, v] of Object.entries(RADIUS)) expect(token(`radius-${k}`), k).toBe(v)
  })
})
