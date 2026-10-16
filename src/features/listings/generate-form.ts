/**
 * POST /listings/generate body (GenerateListingRequest, mkos_schemas/jobs.py): product_id,
 * marketplace, optional category slug, optional user_instructions (1..2000, not blank),
 * force_regenerate. Limits mirror the backend so a bad value never reaches it.
 */
import type { ErrorDetail } from '@/api/types'
import { CATEGORY_RE } from '@/features/rules/labels'
import { charCount } from '@/features/rules/listing-form'
import type { GenerateBody, Marketplace } from './model'

export const INSTRUCTIONS_MAX = 2000

export interface GenerateInput {
  productId: string | null
  marketplace: Marketplace | null
  category: string
  instructions: string
  force: boolean
}

export type GenerateField = 'product' | 'marketplace' | 'category' | 'instructions'
export type GenerateErrors = Partial<Record<GenerateField, string>>

export function validateGenerate(v: GenerateInput): GenerateErrors {
  const e: GenerateErrors = {}
  if (!v.productId) e.product = 'Choose a product.'
  if (!v.marketplace) e.marketplace = 'Choose a marketplace.'
  const cat = v.category.trim()
  if (cat && !CATEGORY_RE.test(cat)) e.category = 'Lowercase letters, digits and underscores, 2 to 64 characters.'
  if (charCount(v.instructions) > INSTRUCTIONS_MAX)
    e.instructions = `At most ${INSTRUCTIONS_MAX.toLocaleString()} characters.`
  return e
}

/** Only call with input that passed validateGenerate. */
export function toGenerateBody(v: GenerateInput & { productId: string; marketplace: Marketplace }): GenerateBody {
  const cat = v.category.trim()
  const instructions = v.instructions.trim() ? v.instructions : null
  return {
    product_id: v.productId,
    marketplace: v.marketplace,
    category: cat || null,
    user_instructions: instructions,
    force_regenerate: v.force,
  }
}

const LOC_FIELD: Record<string, GenerateField> = {
  product_id: 'product',
  marketplace: 'marketplace',
  category: 'category',
  user_instructions: 'instructions',
}

/** 422 details (`["body", "<field>"]`) → this form's fields; the rest is returned unmapped. */
export function mapGenerateErrors(details: readonly ErrorDetail[]): { fields: GenerateErrors; rest: ErrorDetail[] } {
  const fields: GenerateErrors = {}
  const rest: ErrorDetail[] = []
  for (const d of details) {
    const f = d.loc[0] === 'body' ? LOC_FIELD[String(d.loc[1])] : undefined
    if (f && !fields[f]) fields[f] = d.loc.length === 2 && GENERIC.test(d.msg) ? SERVICE_COPY[f] : d.msg
    else rest.push(d)
  }
  return { fields, rest }
}

/** The service's own 422s (InputError) carry a generic message; generation.py says what each means. */
const GENERIC = /^(invalid value\.?|value is not valid\.?)$/i
const SERVICE_COPY: Record<GenerateField, string> = {
  product: 'Generate for the style product. Its variants are listed through it.',
  marketplace: 'Choose a marketplace.',
  category: 'No listing template for this category on this marketplace, or the listing already uses another category.',
  instructions: 'Remove anything that looks like a key or secret from the instructions.',
}
