// Link previews (LinkedIn, WhatsApp, Slack, X) read these tags from the raw HTML; the app renders
// client side, so they must live in index.html. Without them LinkedIn shows "couldn't load a preview".
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
const png = readFileSync(resolve(__dirname, '../../public/og-image.png'))

function meta(attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i')
  return html.match(re)?.[1]
}

describe('social preview tags', () => {
  it('has the Open Graph tags a link preview needs', () => {
    for (const key of ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:alt']) {
      expect(meta('property', key), key).toBeTruthy()
    }
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
  })

  it('uses absolute https URLs on the public origin', () => {
    for (const value of [meta('property', 'og:url'), meta('property', 'og:image'), meta('name', 'twitter:image')]) {
      expect(value).toMatch(/^https:\/\/www\.kuinn\.in\//)
    }
  })

  it('ships a 1200x630 PNG for the image it names', () => {
    expect(meta('property', 'og:image')).toBe('https://www.kuinn.in/og-image.png')
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(meta('property', 'og:image:width')).toBe('1200')
    expect(meta('property', 'og:image:height')).toBe('630')
    expect(png.length).toBeLessThan(5 * 1024 * 1024) // LinkedIn's limit
  })
})
