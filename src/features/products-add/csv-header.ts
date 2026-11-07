/**
 * Read-only "Column matching" for the bulk upload (hi-fi p11). The API matches columns by name
 * only (backend services/imports/headers.py `check_header`): a header is an A.6 name or an alias
 * (after dropping a BOM, trimming and lower-casing), anything else refuses the whole file
 * (HEADER_UNKNOWN_COLUMN), two headers for one column refuse it (HEADER_DUPLICATE_COLUMN), and
 * seller_sku, product_name and category are required. Content, marketplace and workflow columns
 * are accepted but not stored. Photo link columns (main_image, additional_images) are accepted, but
 * no photo is ever fetched from them, so a row that fills one gets a plain warning here. There is
 * no mapping API, so the screen shows what the server will do with each column before upload,
 * and never offers a mapping it cannot honour.
 */
import { COLUMN_ALIASES, COLUMN_GROUPS, PHOTO_LINK_COLUMNS, REQUIRED_COLUMNS } from '@/features/imports/csv-template'

export type ColumnMatch = 'ok' | 'alias' | 'not-stored' | 'photo-link' | 'unknown' | 'duplicate'

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
  /** Data rows with a photo link filled in (links are never fetched). */
  photoLinkRows: number
  /** Rows the server will fail for a bad link (first problem per row), like row_model `media()`. */
  linkProblems: LinkProblem[]
  /** The server would refuse the file because of its header. */
  refused: boolean
}

const BULLET = /^bullet_[1-9][0-9]?$/
const NAME_PATTERN = /^[a-z0-9_]+$/

const STORED = new Set(COLUMN_GROUPS.filter((g) => !g.notStored && !g.photoLinks).flatMap((g) => g.columns))
const PHOTO_LINKS = new Set(PHOTO_LINK_COLUMNS)
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

export interface LinkProblem {
  /** The CSV record number, header = 1 (the import report's `row_number`). */
  row: number
  column: string
  problem: string
}

/** row_model.py: `MAX_MEDIA_URLS`, `MAX_URL`, `_URL_SPLIT`. */
export const MAX_MEDIA_URLS = 9
export const MAX_URL = 2048
const URL_SPLIT = /[|,;\s]+/

/** What the server refuses in one link (`_url_ok`: https, a host, no user or password), or null. */
export function linkProblem(url: string): string | null {
  if (url.length > MAX_URL) return `longer than ${MAX_URL.toLocaleString('en-IN')} characters`
  let u: URL | null = null
  try {
    u = new URL(url)
  } catch {
    u = null
  }
  const ok = !!u && /^https:\/\/[^/?#\s]/i.test(url) && u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  return ok ? null : 'not https'
}

const linkMessage = (column: string, problem: string) =>
  problem === 'not https' ? `${column} must hold https links.` : `A ${column} link is ${problem}.`

/** The row's first link problem, checked in the server's order: each photo link, the count, the size chart. */
function rowLinkProblem(cells: { column: string; value: string; split: boolean }[]): Omit<LinkProblem, 'row'> | null {
  let count = 0
  let countAt: string | null = null
  for (const c of cells.filter((x) => x.split)) {
    for (const url of c.value.split(URL_SPLIT).filter(Boolean)) {
      const p = linkProblem(url)
      if (p) return { column: c.column, problem: linkMessage(c.column, p) }
      count++
      if (count > MAX_MEDIA_URLS) countAt ??= c.column
    }
  }
  if (countAt) return { column: countAt, problem: `At most ${MAX_MEDIA_URLS} photo links per row.` }
  for (const c of cells.filter((x) => !x.split)) {
    const p = linkProblem(c.value)
    if (p) return { column: c.column, problem: linkMessage(c.column, p) }
  }
  return null
}

export function analyzeHeader(header: readonly string[]): Omit<HeaderAnalysis, 'rows' | 'photoLinkRows' | 'linkProblems'> {
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
    } else if (PHOTO_LINKS.has(name)) {
      field = name
      match = 'photo-link'
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
  const analysis = analyzeHeader(header)
  const linkAt = analysis.columns.filter((c) => c.match === 'photo-link').map((c) => c.position - 1)
  const photoLinkRows = linkAt.length ? records.slice(1).filter((r) => linkAt.some((i) => (r[i] ?? '').trim() !== '')).length : 0
  const linkCols = analysis.columns.flatMap((c) =>
    c.match === 'photo-link' || (c.match === 'ok' && c.field === 'size_chart') ? [{ index: c.position - 1, column: c.field!, split: c.match === 'photo-link' }] : [],
  )
  const linkProblems: LinkProblem[] = []
  if (linkCols.length)
    records.slice(1).forEach((r, i) => {
      const cells = linkCols.flatMap((c) => {
        const value = (r[c.index] ?? '').replace(/\s+/g, ' ').trim()
        return value ? [{ column: c.column, value, split: c.split }] : []
      })
      const p = rowLinkProblem(cells)
      if (p) linkProblems.push({ row: i + 2, ...p })
    })
  return { ...analysis, rows: Math.max(0, records.length - 1), photoLinkRows, linkProblems }
}

export const MATCH_COPY: Record<ColumnMatch, string> = {
  ok: 'OK',
  alias: 'OK',
  'not-stored': 'Not stored',
  // Not fetched, but still checked: a bad link fails its row.
  'photo-link': 'Not used',
  unknown: 'Unknown',
  duplicate: 'Duplicate',
}
