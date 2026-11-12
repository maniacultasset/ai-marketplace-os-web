/**
 * Client feedback item 5: the marketplace product type a category maps to, shown wherever a seller
 * picks a category ("On Amazon: Kurta (KURTA) · On Flipkart: Kurta"). Nothing while the catalog is
 * loading or the category maps to no marketplace, so the line never guesses.
 */
import { cn } from '@/lib/utils'
import { mappingText, type CatalogCategory, type CatalogMapping } from './catalog-categories'

type Marketplace = CatalogMapping['marketplace']

export function CategoryMappingLine({
  category,
  catalog,
  listOn = [],
  className,
  'data-testid': testId = 'category-mapping',
}: {
  category: string | null | undefined
  catalog: readonly CatalogCategory[] | null | undefined
  listOn?: readonly Marketplace[]
  className?: string
  'data-testid'?: string
}) {
  const slug = (category ?? '').trim()
  const item = slug ? catalog?.find((c) => c.category === slug) : undefined
  const text = mappingText(item, listOn)
  if (!text) return null
  return (
    <span className={cn('block text-caption break-words text-ink-2', className)} data-testid={testId}>
      {text}
    </span>
  )
}
