/** Times as the hi-fi writes them: "10:42" today, "14 Oct, 10:42" otherwise. Local time. */
export function clock(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return hm
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${day}, ${hm}`
}

export const MARKETPLACE_NAME: Record<string, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }
export const mpName = (m: string) => MARKETPLACE_NAME[m] ?? m

/** "womens_tshirts" → "Womens tshirts" (the slug is all the API returns). */
export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'No category'
  const s = slug.replace(/_+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : slug
}
