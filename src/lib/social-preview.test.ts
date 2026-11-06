// Link previews (LinkedIn, WhatsApp, Slack, X) read these tags from the raw HTML; the app renders
// client side, so they must live in index.html. Without them LinkedIn shows "couldn't load a preview".
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
const png = readFileSync(resolve(__dirname, '../../public/og-image.jpg'))

function findSof(buf: Buffer): { width: number; height: number } | null {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1] ?? 0
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

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

  it('ships a 1200x630 JPEG for the image it names, small enough for WhatsApp', () => {
    expect(meta('property', 'og:image')).toBe('https://www.kuinn.in/og-image.jpg')
    expect(meta('property', 'og:image:type')).toBe('image/jpeg')
    expect(png[0]).toBe(0xff)
    expect(png[1]).toBe(0xd8) // JPEG SOI
    const sof = findSof(png)
    expect(sof).toEqual({ width: 1200, height: 630 })
    expect(meta('property', 'og:image:width')).toBe('1200')
    expect(meta('property', 'og:image:height')).toBe('630')
    expect(png.length).toBeLessThan(300 * 1024) // WhatsApp shows larger images unreliably
  })

  it('does not tie the brand to two marketplaces', () => {
    for (const value of [meta('property', 'og:title'), meta('property', 'og:description'), meta('name', 'description')]) {
      expect(value).not.toMatch(/Amazon and Flipkart/)
    }
  })
})
