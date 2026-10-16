import { describe, expect, it } from 'vitest'
import { toApiError } from './errors'
import { etagFromVersionId, ifMatchHeader, isStaleVersion, normalizeEtag, readEtag, unwrapVersioned } from './etag'

const ID = '37ad34be-341a-5c3f-b844-4dd04ea98536'
const envelope = (status: number, type: string) => ({
  error: { type, message: 'm', status, correlation_id: 'req-9', details: null, error_report: null },
})

describe('normalizeEtag', () => {
  it('keeps a quoted tag, quotes a bare one, strips weak prefix', () => {
    expect(normalizeEtag(`"${ID}"`)).toBe(`"${ID}"`)
    expect(normalizeEtag(ID)).toBe(`"${ID}"`)
    expect(normalizeEtag(`W/"${ID}"`)).toBe(`"${ID}"`)
    expect(normalizeEtag('  ')).toBeNull()
    expect(normalizeEtag(null)).toBeNull()
  })
  it('derives a tag from a version id', () => {
    expect(etagFromVersionId(ID)).toBe(`"${ID}"`)
    expect(etagFromVersionId(null)).toBeNull()
  })
})

describe('readEtag / ifMatchHeader', () => {
  it('reads the ETag response header', () => {
    expect(readEtag(new Response(null, { headers: { ETag: `"${ID}"` } }))).toBe(`"${ID}"`)
    expect(readEtag(new Response(null))).toBeNull()
  })
  it('builds If-Match and refuses without a tag', () => {
    expect(ifMatchHeader(`"${ID}"`)).toEqual({ 'If-Match': `"${ID}"` })
    expect(() => ifMatchHeader(null)).toThrow(/no ETag/)
  })
})

describe('unwrapVersioned', () => {
  it('returns the body and the ETag', async () => {
    const response = new Response('{}', { status: 200, headers: { ETag: `"${ID}"` } })
    const out = await unwrapVersioned(Promise.resolve({ data: { tone: 'warm' }, response }))
    expect(out).toEqual({ data: { tone: 'warm' }, etag: `"${ID}"` })
  })
  it('throws a STALE_VERSION ApiError on 409', async () => {
    const response = new Response(null, { status: 409, headers: { 'X-Request-ID': 'req-9' } })
    const err = await unwrapVersioned(
      Promise.resolve({ error: envelope(409, 'STALE_VERSION'), response }),
    ).catch((e: unknown) => e)
    expect(isStaleVersion(err)).toBe(true)
    expect(isStaleVersion(toApiError(new Response(null, { status: 409 }), envelope(409, 'SKU_CONFLICT')))).toBe(false)
  })
})
