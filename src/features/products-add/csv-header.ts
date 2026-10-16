/**
 * Read-only "Column matching" for the bulk upload (hi-fi p11). The API matches columns by name
 * only (backend services/imports/headers.py `check_header`): a header is an A.6 name or an alias
 * (after dropping a BOM, trimming and lower-casing), anything else refuses the whole file
 * (HEADER_UNKNOWN_COLUMN), two headers for one column refuse it (HEADER_DUPLICATE_COLUMN), and
 * seller_sku, product_name and category are required. Content, marketplace and workflow columns
 * are accepted but not stored. There is no mapping API, so the screen shows what the server will
 * do with each column before upload, and never offers a mapping it cannot honour.
 */
import { COLUMN_ALIASES, COLUMN_GROUPS, REQUIRED_COLUMNS } from '@/features/imports/csv-template'

export type ColumnMatch = 'ok' | 'alias' | 'not-stored' | 'unknown' | 'duplicate'

export interface ColumnResult {
  position: number
  /** The header as written in the file. */
  raw: string
  /** The column the server fills, or null when unknown. */
  field: string | null
  match: ColumnMatch
}

export interface HeaderAnalysis {
  columns: ColumnResult[]
  missing: string[]
  /** Data rows in the file (records after the header, blank lines skipped). */
  rows: number
  /** The server would refuse the file because of its header. */
  refused: boolean
}

const BULLET = /^bullet_[1-9][0-9]?$/
const NAME_PATTERN = /^[a-z0-9_]+$/

const STORED = new Set(COLUMN_GROUPS.filter((g) => !g.notStored).flatMap((g) => g.columns))
const NOT_STORED = new Set(
  COLUMN_GROUPS.filter((g) => g.notStored)
    .flatMap((g) => g.columns)
    .filter((c) => NAME_PATTERN.test(c)),
)
const ALIAS = new Map(COLUMN_ALIASES.map((a) => [a.alias, a.column]))

export const normalizeHeader = (raw: string) => raw.replace(/^﻿/, '').trim().toLowerCase()

/**
 * Split CSV text into records (RFC 4180: quoted fields may hold commas, quotes and line breaks).
 * Stops after `limit` records when given.
 */
export function parseCsv(text: string, limit = Infinity): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const n = text.length
  const endRow = () => {
    row.push(cell)
    cell = ''
    if (!(row.length === 1 && row[0] === '')) out.push(row)
    row = []
  }
  while (i < n && out.length < limit) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
      } else cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' || ch === '\n') {
      endRow()
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else cell += ch
    i++
  }
  if (out.length < limit && (cell !== '' || row.length)) endRow()
  return out
}

export function analyzeHeader(header: readonly string[]): Omit<HeaderAnalysis, 'rows'> {
  const columns: ColumnResult[] = []
  const seen = new Set<string>()
  const present = new Set<string>()
  header.forEach((raw, idx) => {
    const name = normalizeHeader(raw)
    let field: string | null = null
    let match: ColumnMatch
    if (STORED.has(name)) {
      field = name
      match = 'ok'
    } else if (ALIAS.has(name)) {
      field = ALIAS.get(name)!
      match = 'alias'
    } else if (NOT_STORED.has(name) || BULLET.test(name)) {
      field = name
      match = 'not-stored'
    } else match = 'unknown'
    if (field !== null) {
      const identity = BULLET.test(name) ? name : field
      if (seen.has(identity)) match = 'duplicate'
      else {
        seen.add(identity)
        present.add(field)
      }
    }
    columns.push({ position: idx + 1, raw, field, match })
  })
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c))
  const refused = missing.length > 0 || columns.some((c) => c.match === 'unknown' || c.match === 'duplicate')
  return { columns, missing, refused }
}

export function analyzeCsv(text: string): HeaderAnalysis {
  const records = parseCsv(text)
  const header = records[0] ?? []
  return { ...analyzeHeader(header), rows: Math.max(0, records.length - 1) }
}

export const MATCH_COPY: Record<ColumnMatch, string> = {
  ok: 'OK',
  alias: 'OK',
  'not-stored': 'Not stored',
  unknown: 'Unknown',
  duplicate: 'Duplicate',
}
