import { describe, expect, it } from 'vitest'
import openapi from './openapi.json'
import { IDEMPOTENT_OPS, idempotencyHeader, newIdempotencyKey, requiresIdempotencyKey } from './idempotency'

type Op = { parameters?: { name: string; in: string; required?: boolean }[] }
const paths = (openapi as unknown as { paths: Record<string, Record<string, Op>> }).paths

/** Ops whose OpenAPI parameters declare a required Idempotency-Key header. */
function contractOps(): string[] {
  const out: string[] = []
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const p = op.parameters?.find((x) => x.in === 'header' && x.name.toLowerCase() === 'idempotency-key')
      if (p?.required) out.push(`${method.toUpperCase()} ${path.replace(/^\/api\/v1/, '')}`)
    }
  }
  return out.sort()
}

describe('IDEMPOTENT_OPS', () => {
  it('matches the contract exactly', () => {
    expect([...IDEMPOTENT_OPS].sort()).toEqual(contractOps())
  })
  it('helpers', () => {
    expect(requiresIdempotencyKey('POST /issues/{issue_id}/dismiss')).toBe(true)
    expect(requiresIdempotencyKey('POST /products')).toBe(false)
    const k = newIdempotencyKey()
    expect(k).toMatch(/^[\x21-\x7E]{1,255}$/)
    expect(idempotencyHeader(k)).toEqual({ 'Idempotency-Key': k })
  })
})
