/**
 * Client validation for POST /products, mirroring `ProductCreate`
 * (backend apps/api/app/api/v1/schemas/products.py): StrictModel, whitespace-stripped strings,
 * lengths in code points (Python `len`).
 */
import { z } from 'zod'
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
const hasNul = (s: string) => s.includes('\u0000')

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
      .regex(ATTRIBUTE_KEY_PATTERN, 'Lowercase letters, digits and _; start with a letter; max 64.'),
    type: z.enum(ATTRIBUTE_TYPES),
    value: z.string(),
  })
  .superRefine((row, ctx) => {
    const v = row.type === 'text' ? row.value.trim() : row.value
    if (row.type === 'text') {
      if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a value or remove the row.' })
      else if (codePoints(v) > ATTRIBUTE_TEXT_MAX)
        ctx.addIssue({ code: 'custom', path: ['value'], message: `At most ${ATTRIBUTE_TEXT_MAX} characters.` })
      else if (hasNul(v)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Remove the NUL character.' })
    } else if (row.type === 'number') {
      if (toJsonNumber(v) === null)
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a finite number.' })
    } else if (v !== 'true' && v !== 'false') {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Choose true or false.' })
    }
  })

export const productFormSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, 'Enter a SKU.')
      .max(SKU_MAX, `At most ${SKU_MAX} characters.`)
      .refine((s) => SKU_PATTERN.test(s) && !s.includes('﻿'), 'No spaces or "]" allowed.')
      .refine((s) => !hasNul(s), 'Remove the NUL character.'),
    title: z
      .string()
      .trim()
      .min(1, 'Enter a title.')
      .refine((s) => codePoints(s) <= TITLE_MAX, `At most ${TITLE_MAX} characters.`)
      .refine((s) => !hasNul(s), 'Remove the NUL character.'),
    category: z
      .string()
      .trim()
      .min(1, 'Enter a category.')
      .regex(CATEGORY_PATTERN, '2-64 lowercase letters, digits or _ (e.g. ethnic_wear_kurta_sets).'),
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
