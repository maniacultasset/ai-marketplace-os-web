/**
 * Text with no API path or HTTP verb in it (client pass 2, B13: "set the product's gender (PATCH
 * /api/v1/products/{product_id})"). The backend no longer writes these; findings stored before the
 * fix still carry them, so every seller line drops them here.
 */
export function withoutApiText(text: string): string {
  const out = text
    .replace(/\s*\((?:GET|POST|PUT|PATCH|DELETE)\s+\/[^)]*\)/g, '')
    .replace(/\s*\(\s*\/api\/[^)]*\)/g, '')
    .replace(/\s*\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/\S*/g, '')
    .replace(/\s*\/api\/\S*/g, '')
  // only around what was taken out: "gender (PATCH ...)." -> "gender."
  return out === text ? text : out.replace(/\s+([.,;:])/g, '$1').trim()
}
