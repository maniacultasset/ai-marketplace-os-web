/**
 * Client validation for POST /products, mirroring `ProductCreate`
 * (backend apps/api/app/api/v1/schemas/products.py): StrictModel, whitespace-stripped strings,
 * lengths in code points (Python `len`).
 */
import { z } from 'zod'
import { CONTROL_MSG, hasControlChars, hasStrayControlChars } from '@/lib/validation'
import type { ProductCreateBody } from './api'

export const SKU_MAX = 64
export const TITLE_MAX = 500
export const ATTRIBUTE_TEXT_MAX = 2000
export const MAX_ATTRIBUTES = 200

export const SKU_PATTERN = /^[^\]\s]{1,64}$/
export const CATEGORY_PATTERN = /^[a-z0-9_]{2,64}$/
export const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/** Length as the backend counts it (code points, not UTF-16 units). */
export const codePoints = (s: string) => [...s].length

/** Shared by /products/new and the guided form. */
export const ATTRIBUTE_KEY_MSG =
  'Use lowercase letters, digits and _ in the attribute, starting with a letter (for example occasion).'
/** A number attribute value that is not a plain decimal (the same wording as the rules dry run). */
export const NUMBER_MSG = 'Enter a number, like 42, -5 or 3.5.'

/**
 * What is wrong with a seller SKU (backend `^[^\]\s]{1,64}$`, no BOM), or null. `label` reads after
 * a verb ("the SKU", "the variant SKU"). Shared by /products/new, the guided form and variants.
 */
export function skuProblem(raw: string, label = 'the SKU'): string | null {
  const sku = raw.trim()
  if (!sku) return 'Enter a SKU.'
  if (hasControlChars(sku) || sku.includes('\uFEFF')) return CONTROL_MSG
  if (/\s/.test(sku)) return `Remove the spaces from ${label}. Use - or _ to separate words.`
  if (sku.includes(']')) return `Remove the "]" from ${label}.`
  if (!SKU_PATTERN.test(sku)) return `Shorten ${label} to ${SKU_MAX} characters or fewer.`
  return null
}

/**
 * What is wrong with a product title, or null: required, at most 500 code points, no control
 * characters, and at least one letter ("12345" is not a name; "Levi’s 501", "खादी कुर्ता" are).
 * `label` is the noun as the form names it ("the title", "the product name").
 */
export function productTitleProblem(raw: string, label = 'the title'): string | null {
  const v = raw.trim()
  if (!v) return `Enter ${label}.`
  if (hasStrayControlChars(v)) return CONTROL_MSG
  if (!/\p{L}/u.test(v)) return `Include at least one letter in ${label}, not only numbers or symbols.`
  if (codePoints(v) > TITLE_MAX) return `Shorten ${label} to ${TITLE_MAX} characters or fewer.`
  return null
}

/** What is wrong with a category slug (`^[a-z0-9_]{2,64}$`), or null, with the fixed value when obvious. */
export function categoryProblem(raw: string): string | null {
  const category = raw.trim()
  if (!category) return 'Enter a category.'
  if (CATEGORY_PATTERN.test(category)) return null
  const lower = category.toLowerCase()
  if (/[A-Z]/.test(category) && CATEGORY_PATTERN.test(lower)) return `Use lowercase letters in the category: ${lower}.`
  const joined = lower.replace(/[\s-]+/g, '_')
  if (/[\s-]/.test(category) && CATEGORY_PATTERN.test(joined)) return `Use _ between words in the category: ${joined}.`
  return 'Use 2 to 64 lowercase letters, digits or _ in the category, for example ethnic_wear_kurta_sets.'
}

/** Decimal only: no hex/binary/octal, no Infinity, no leading "+" or ".5". */
export const DECIMAL_NUMBER_PATTERN = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

/**
 * The exact JSON number literal for a decimal the user typed, or null when it is not a finite
 * decimal. Digits are kept as typed (only leading zeros, which JSON forbids, are dropped), so
 * integers beyond 2^53 reach the backend (arbitrary-size `int`) without rounding.
 */
export function toJsonNumber(input: string): string | null {
  const v = input.trim()
  if (!DECIMAL_NUMBER_PATTERN.test(v) || !Number.isFinite(Number(v))) return null
  return v.replace(/^(-?)0+(?=\d)/, '$1')
}

/** Input aliases from attribute_dictionary.json (`input_aliases`): saved under the canonical key. */
export const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = { material: 'fabric_type' }
export const canonicalKey = (key: string) => ATTRIBUTE_ALIASES[key] ?? key

export const ATTRIBUTE_TYPES = ['text', 'number', 'boolean'] as const
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]

const attributeRow = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Enter a key.')
      .regex(ATTRIBUTE_KEY_PATTERN, ATTRIBUTE_KEY_MSG),
    type: z.enum(ATTRIBUTE_TYPES),
    value: z.string(),
  })
  .superRefine((row, ctx) => {
    const v = row.type === 'text' ? row.value.trim() : row.value
    if (row.type === 'text') {
      if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a value or remove the row.' })
      else if (hasStrayControlChars(v)) ctx.addIssue({ code: 'custom', path: ['value'], message: CONTROL_MSG })
      else if (codePoints(v) > ATTRIBUTE_TEXT_MAX)
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: `Shorten the value to ${ATTRIBUTE_TEXT_MAX.toLocaleString('en-IN')} characters or fewer.`,
        })
    } else if (row.type === 'number') {
      if (toJsonNumber(v) === null)
        ctx.addIssue({ code: 'custom', path: ['value'], message: NUMBER_MSG })
    } else if (v !== 'true' && v !== 'false') {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Choose true or false.' })
    }
  })

export const productFormSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        const p = skuProblem(v)
        if (p) ctx.addIssue({ code: 'custom', message: p })
      }),
    title: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        const p = productTitleProblem(v)
        if (p) ctx.addIssue({ code: 'custom', message: p })
      }),
    category: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        const p = categoryProblem(v)
        if (p) ctx.addIssue({ code: 'custom', message: p })
      }),
    attributes: z.array(attributeRow).max(MAX_ATTRIBUTES, `At most ${MAX_ATTRIBUTES} attributes.`),
  })
  .superRefine((form, ctx) => {
    const seen = new Map<string, string>()
    form.attributes.forEach((row, i) => {
      const k = row.key.trim()
      if (!k) return
      const canonical = canonicalKey(k)
      const first = seen.get(canonical)
      if (first === undefined) seen.set(canonical, k)
      else
        ctx.addIssue({
          code: 'custom',
          path: ['attributes', i, 'key'],
          message: first === k ? 'Duplicate key.' : `Same attribute as "${first}" (both are saved as ${canonical}).`,
        })
    })
  })

export type ProductFormInput = z.input<typeof productFormSchema>
export type ProductFormValues = z.output<typeof productFormSchema>

export const emptyAttribute = (): ProductFormInput['attributes'][number] => ({ key: '', type: 'text', value: '' })

/**
 * Form values -> the exact `ProductCreate` JSON (no unknown keys, no `images`). Built by hand,
 * not JSON.stringify of a JS object, so number attributes go out as the literal the user typed
 * (JS numbers would round integers above 2^53).
 */
export function toCreateJson(values: ProductFormValues): string {
  const attrs = values.attributes.map((row) => {
    const value =
      row.type === 'number'
        ? (toJsonNumber(row.value) ?? 'null')
        : row.type === 'boolean'
          ? String(row.value === 'true')
          : JSON.stringify(row.value.trim())
    return `${JSON.stringify(row.key)}:${value}`
  })
  const head = JSON.stringify({ sku: values.sku, title: values.title, category: values.category })
  return `${head.slice(0, -1)},"attributes":{${attrs.join(',')}}}`
}

/** The same body as a typed object (numbers as JS numbers: for typing and caches, not the wire). */
export function toCreateBody(values: ProductFormValues): ProductCreateBody {
  return JSON.parse(toCreateJson(values)) as ProductCreateBody
}

/** Categories with seeded templates; merged with categories seen in loaded products. */
export const KNOWN_CATEGORIES = ['ethnic_wear_kurta_sets', 'home_decor_lamps'] as const

/**
 * Attribute keys the backend accepts for a standalone product (attribute_dictionary.json,
 * storage `attributes`, owner `standalone`; plus the `material` alias of `fabric_type`).
 * Only used as input suggestions: the server is the authority (unknown -> 422 UNKNOWN_FACT_KEY).
 */
export const ATTRIBUTE_KEY_SUGGESTIONS = [
  'size', 'size_measurements', 'fabric_type', 'material', 'fiber_composition', 'lining', 'gsm', 'wash_care',
  'iron_care', 'certifications', 'performance_claims', 'set_composition', 'number_of_pieces',
  'product_dimensions', 'color', 'secondary_color', 'size_system', 'body_type', 'age_group', 'construction',
  'weave_finish', 'transparency', 'stretch', 'fit', 'pattern', 'silhouette', 'neckline', 'collar_type',
  'sleeve_type', 'sleeve_length', 'cuff_type', 'garment_length', 'rise', 'waist_style', 'leg_style', 'closure',
  'pocket_type', 'hem', 'placket', 'print_type', 'embroidery', 'occasion', 'season', 'kurta_type', 'dress_type',
  'side_slits', 'wash', 'distressed', 'pleat', 'insulation', 'hood', 'fleece',
] as const
