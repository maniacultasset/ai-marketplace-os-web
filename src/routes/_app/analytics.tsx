import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { RequireAction } from '@/components/states/require-action'
import { Dashboard } from '@/features/analytics-images/analytics/dashboard'
import { DEFAULT_PRESET, isRangePreset, type RangePreset } from '@/features/analytics-images/analytics/metrics'

const searchSchema = z.object({
  range: z.custom<RangePreset>(isRangePreset).optional().catch(undefined),
})

/**
 * /analytics: listing reports (GET /analytics/summary + GET /analytics). Linked from Home; not in
 * the sidebar (the hi-fi has no analytics frame). Roles without `analytics:read` see Forbidden.
 */
export const Route = createFileRoute('/_app/analytics')({
  validateSearch: searchSchema,
  staticData: { title: 'Listing reports' },
  component: AnalyticsPage,
})

function AnalyticsPage() {
  return (
    <RequireAction action="analytics:read">
      <DashboardPage />
    </RequireAction>
  )
}

function DashboardPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/analytics' })
  const preset = search.range ?? DEFAULT_PRESET
  return (
    <Dashboard
      preset={preset}
      onPreset={(p) =>
        void navigate({ search: (s) => ({ ...s, range: p === DEFAULT_PRESET ? undefined : p }), replace: true })
      }
    />
  )
}
