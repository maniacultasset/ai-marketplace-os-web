/**
 * Reads the CSV header contract out of the backend's apps/api/app/services/imports/headers.py:
 * the lists `A6_COLUMNS`, `EXTENSION_COLUMNS`, `REQUIRED`, `IGNORED_WITH_WARNING` and the
 * `ALIASES` map. Used by scripts/refresh-backend-headers.ts to write
 * backend-headers.snapshot.json, and by its test. No imports, so Node runs it as is.
 */
export interface HeadersContract {
  a6: string[]
  extension: string[]
  /** Alias header → the row model's key (`package_weight_g` for the grams aliases). */
  aliases: Record<string, string>
  required: string[]
  /** Sorted: headers.py keeps them in a frozenset. */
  ignored: string[]
}

export const HEADERS_PY_PATH = 'apps/api/app/services/imports/headers.py'

/** The text of `NAME: ... = (…)` or `{…}`, up to its balanced close, comments dropped. */
function pyBlock(src: string, name: string): string {
  const start = src.search(new RegExp(`^${name}:`, 'm'))
  if (start < 0) throw new Error(`${name} not found in headers.py`)
  const from = start + src.slice(start).search(/= /)
  const text = src.slice(from).replace(/#.*$/gm, '')
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '(' || ch === '{') depth++
    else if (ch === ')' || ch === '}') {
      depth--
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  throw new Error(`${name} is not closed in headers.py`)
}

const strings = (block: string) => [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)

export function parseHeadersPy(src: string): HeadersContract {
  const grams = /^GRAMS_COLUMN:\s*Final\s*=\s*"([^"]+)"/m.exec(src)?.[1] ?? 'package_weight_g'
  const aliasBlock = pyBlock(src, 'ALIASES').replace(/GRAMS_COLUMN/g, `"${grams}"`)
  return {
    a6: strings(pyBlock(src, 'A6_COLUMNS')),
    extension: strings(pyBlock(src, 'EXTENSION_COLUMNS')),
    aliases: Object.fromEntries([...aliasBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1]!, m[2]!])),
    required: strings(pyBlock(src, 'REQUIRED')),
    ignored: strings(pyBlock(src, 'IGNORED_WITH_WARNING')).sort(),
  }
}
