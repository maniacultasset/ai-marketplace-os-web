import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { HomePage } from '@/features/home-inbox/home-page'
import type { BrandScope } from '@/features/home-inbox/brands-model'

/** `?brands=all`: the overview of every brand (client feedback item 18). A bad value is dropped. */
const homeSearchSchema = z.object({ brands: z.enum(['all']).optional().catch(undefined) })

// Owner: home-inbox. Hi-fi 06 Home and 05 Home, first run (docs/DESIGN.md).
export const Route = createFileRoute('/_app/home')({
  staticData: { title: 'Home' },
  validateSearch: homeSearchSchema,
  component: HomeRoute,
})

function HomeRoute() {
  const { brands } = Route.useSearch()
  const navigate = useNavigate({ from: '/home' })
  const onScope = (s: BrandScope) => void navigate({ search: s ? { brands: s } : {}, replace: true })
  return <HomePage scope={brands} onScope={onScope} />
}
