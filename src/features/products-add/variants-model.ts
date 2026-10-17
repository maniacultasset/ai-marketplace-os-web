/**
 * Variants and media (hi-fi p10) model. The API has no variant endpoint (no `PUT
 * /products/{id}/family`); the only way to create variants is a CSV import with `parent_style_id`
 * (backend services/imports/runner.py: a family = the style row plus child rows naming it; the
 * matrix's missing colour x size cells are derived as "not provided"). So this screen builds that
 * spreadsheet from the matrix and either downloads it or uploads it to POST /products/bulk.
 *
 * Validation mirrors services/imports/row_model.py: seller_sku `^[^\]\s]{1,64}$`; size key
 * `[a-z0-9][a-z0-9 ./+-]{0,31}` (lower-cased); colour ≤ 64; money `[0-9]{1,10}(\.[0-9]{1,2})?`
 * (₹, commas and spaces stripped), positive; selling_price ≤ mrp; identifier GTIN-8/12/13/14 with a
 * valid GS1 check digit; at most 40 sizes per family (runner.MAX_SIZE_RUN).
 */
import { codePoints } from '@/features/products/schema'
import { CONTROL_MSG, hasControlChars, money, parseMoney } from '@/lib/validation'
import { skuProblem } from './guided-model'

export const SIZE_KEY_PATTERN = /^[a-z0-9][a-z0-9 ./+-]{0,31}$/
export const MONEY_PATTERN = /^[0-9]{1,10}(\.[0-9]{1,2})?$/
export const GTIN_PATTERN = /^([0-9]{8}|[0-9]{12,14})$/
export const MAX_COLOUR = 64
export const MAX_SIZE_RUN = 40
/** SIZE_KEY_PATTERN's length: 1 + 31. */
export const MAX_SIZE = 32
export const GTIN_MAX = 14


/** What is wrong with one colour name, or null. A colour is named with words ("Off white"), so it needs a letter. */
export function colourProblem(raw: string): string | null {
  const c = raw.trim()
  if (!c) return 'Enter a colour name.'
  if (hasControlChars(c)) return CONTROL_MSG
  if (!/\p{L}/u.test(c)) return `Name the colour “${c}” with letters, for example Black or Off white.`
  if (codePoints(c) > MAX_COLOUR) return `Shorten “${c}” to ${MAX_COLOUR} characters or fewer.`
  return null
}

/** What is wrong with one size, or null (the import's size key, compared lower-cased). */
export function sizeProblem(raw: string): string | null {
  const z = raw.trim()
  if (!z) return 'Enter a size.'
  if (codePoints(z) > MAX_SIZE) return `Shorten “${z}” to ${MAX_SIZE} characters or fewer.`
  if (!SIZE_KEY_PATTERN.test(z.toLowerCase()))
    return `“${z}” can’t be used as a size. Start with a letter or digit, then use only letters, digits, spaces and . / + -.`
  return null
}

const moneyProblem = (raw: string, label: string): string | null => {
  const r = money(label).safeParse(raw)
  return r.success ? null : (r.error.issues[0]?.message ?? `Check ${label}.`)
}

/** What is wrong with a GTIN / EAN / UPC, or null when blank (exempt) or valid. */
export function gtinProblem(raw: string): string | null {
  const id = raw.trim()
  if (!id) return null
  if (!/^[0-9]+$/.test(id)) return 'Use digits only for the GTIN, EAN or UPC.'
  if (!GTIN_PATTERN.test(id)) return `Use 8, 12, 13 or 14 digits for the GTIN, EAN or UPC (this has ${id.length}).`
  if (!gtinValid(id)) return 'The last (check) digit doesn’t match. Copy the number again from the barcode.'
  return null
}

export const SIZE_SYSTEMS: readonly { value: string; label: string; sizes: string[] }[] = [
  { value: 'alpha', label: 'Alpha (XS to XXL)', sizes: ['S', 'M', 'L', 'XL'] },
  { value: 'numeric', label: 'Numeric (28 to 40)', sizes: ['28', '30', '32', '34'] },
  { value: 'uk', label: 'UK', sizes: ['8', '10', '12', '14'] },
  { value: 'free_size', label: 'Free size', sizes: ['Free size'] },
]

export interface Commercial {
  mrp: string
  price: string
  /** GTIN / EAN / UPC digits; blank when the product is exempt. */
  identifier: string
}

export interface VariantsState {
  colours: string[]
  sizes: string[]
  sizeSystem: string
  /** Matrix cells marked "not made" (cellKey). */
  unavailable: string[]
  commercial: Record<string, Commercial>
  /** SKU overrides per cell (cellKey); otherwise variantSku(). */
  skus: Record<string, string>
}

export const cellKey = (colour: string, size: string) => `${colour}\u0000${size}`

export const emptyVariants = (): VariantsState => ({
  colours: [],
  sizes: [],
  sizeSystem: 'alpha',
  unavailable: [],
  commercial: {},
  skus: {},
})

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, '').trim()

/**
 * One word: its first letter, its first and last consonants after that, topped up in spelling order when there are
 * fewer than three (the hi-fi's "BLK-S", p10/p17). Several words: their initials.
 * "Black" → "BLK", "White" → "WHT", "Red" → "RED", "Blue" → "BLU", "Off white" → "OFW",
 * "Navy blue melange" → "NBM".
 */
function wordCode(word: string): string {
  if (/^[0-9]/.test(word) || word.length <= 3) return word.slice(0, 3)
  const cons: number[] = []
  for (let i = 1; i < word.length; i++) if (!/[AEIOU]/.test(word[i]!)) cons.push(i)
  // First letter, first consonant after it, last consonant: Black → BLK, Green → GRN, Yellow → YLW.
  const picked = cons.length >= 2 ? [0, cons[0]!, cons[cons.length - 1]!] : [0, ...cons]
  for (let i = 1; i < word.length && picked.length < 3; i++) if (!picked.includes(i)) picked.push(i)
  return picked
    .sort((a, b) => a - b)
    .map((i) => word[i])
    .join('')
}

export function colourCode(colour: string): string {
  const words = alnum(colour).split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'X'
  if (words.length === 1) return wordCode(words[0]!)
  const initials = words.map((w) => w[0]).join('')
  if (initials.length >= 3) return initials.slice(0, 3)
  return (words[0]!.slice(0, 1 + 3 - initials.length) + initials.slice(1)).slice(0, 3)
}

/** "Free size" → "FREESIZE", "xl" → "XL". */
export const sizeCode = (size: string) => alnum(size).replace(/\s+/g, '') || 'X'

export function variantSku(base: string, colour: string | null, size: string | null): string {
  return [base, colour !== null ? colourCode(colour) : null, size !== null ? sizeCode(size) : null].filter(Boolean).join('-')
}

export interface VariantRow {
  key: string
  colour: string | null
  size: string | null
  sku: string
}

/**
 * The variants the matrix makes, in matrix order. A family may vary by colour only, size only, or
 * both (backend theme color / size / size_color); with no colours and no sizes there are none.
 */
export function buildVariants(base: string, s: VariantsState): VariantRow[] {
  const colours: (string | null)[] = s.colours.length ? s.colours : [null]
  const sizes: (string | null)[] = s.sizes.length ? s.sizes : [null]
  if (!s.colours.length && !s.sizes.length) return []
  const out: VariantRow[] = []
  for (const c of colours)
    for (const z of sizes) {
      const key = cellKey(c ?? '', z ?? '')
      if (s.unavailable.includes(key)) continue
      out.push({ key, colour: c, size: z, sku: s.skus[key]?.trim() || variantSku(base, c, z) })
    }
  return out
}

/** "₹ 1,299" → "1299" (the import's own cleaning), or null when blank. */
export const cleanMoney = parseMoney

/** GS1 check digit over GTIN-8/12/13/14 (row_model.gtin_valid). */
export function gtinValid(value: string): boolean {
  if (!GTIN_PATTERN.test(value)) return false
  const digits = value.padStart(14, '0').split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export type VariantErrors = Partial<Record<string, string>>

/** Keys: colours, sizes, `<cellKey>.sku|mrp|price|identifier`, form. */
export function validateVariants(base: string, s: VariantsState): VariantErrors {
  const e: VariantErrors = {}
  const colour = s.colours.map(colourProblem).find(Boolean)
  if (colour) e.colours = colour
  const size = s.sizes.map(sizeProblem).find(Boolean)
  if (size) e.sizes = size
  else if (s.sizes.length > MAX_SIZE_RUN) e.sizes = `A style can have at most ${MAX_SIZE_RUN} sizes. Remove ${s.sizes.length - MAX_SIZE_RUN}.`
  const rows = buildVariants(base, s)
  if (rows.length === 0) e.form = 'Add at least one colour or size.'
  const seen = new Set<string>([base])
  for (const r of rows) {
    const sku = skuProblem(r.sku, 'the variant SKU')
    if (sku) e[`${r.key}.sku`] = sku
    else if (seen.has(r.sku)) e[`${r.key}.sku`] = r.sku === base ? 'This is the style’s own SKU. Give the variant its own.' : 'This SKU is used twice. Change one of them.'
    seen.add(r.sku)
    const c = s.commercial[r.key]
    const mrpErr = c ? moneyProblem(c.mrp, 'the MRP') : null
    const priceErr = c ? moneyProblem(c.price, 'the price') : null
    if (mrpErr) e[`${r.key}.mrp`] = mrpErr
    if (priceErr) e[`${r.key}.price`] = priceErr
    const mrp = c ? cleanMoney(c.mrp) : null
    const price = c ? cleanMoney(c.price) : null
    if (!mrpErr && !priceErr && price !== null && mrp !== null && Number(price) > Number(mrp))
      e[`${r.key}.price`] = `The price can’t be above the MRP (₹${Number(mrp).toLocaleString('en-IN', { minimumFractionDigits: mrp.includes('.') ? 2 : 0 })}). Lower it or raise the MRP.`
    const id = gtinProblem(c?.identifier ?? '')
    if (id) e[`${r.key}.identifier`] = id
  }
  return e
}

/** One CSV cell (RFC 4180): quoted when it holds a comma, quote, line break or edge space. */
export function csvCell(v: string): string {
  return /[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export const FAMILY_HEADER = [
  'seller_sku',
  'parent_style_id',
  'product_name',
  'category',
  'color_name',
  'size_name',
  'size_system',
  'mrp',
  'selling_price',
  'product_identifier_type',
  'product_identifier',
] as const

/**
 * The family as an import CSV: the style row (the existing product's SKU, name and category, so the
 * import updates it in place) and one row per variant naming it in parent_style_id.
 */
export function buildFamilyCsv(base: { sku: string; title: string; category: string }, s: VariantsState): string {
  const lines: string[][] = [[...FAMILY_HEADER]]
  lines.push([base.sku, '', base.title, base.category, '', '', s.sizes.length ? s.sizeSystem : '', '', '', '', ''])
  for (const r of buildVariants(base.sku, s)) {
    const c = s.commercial[r.key]
    const id = c?.identifier.trim() ?? ''
    lines.push([
      r.sku,
      base.sku,
      base.title,
      base.category,
      r.colour ?? '',
      r.size ?? '',
      '',
      (c && cleanMoney(c.mrp)) ?? '',
      (c && cleanMoney(c.price)) ?? '',
      id ? 'gtin' : '',
      id,
    ])
  }
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Add a tag (colour or size) if it is new (case-insensitive) and not blank. */
export function addTag(list: readonly string[], raw: string): string[] {
  const v = raw.trim().replace(/\s+/g, ' ')
  if (!v || list.some((x) => x.toLowerCase() === v.toLowerCase())) return [...list]
  return [...list, v]
}
