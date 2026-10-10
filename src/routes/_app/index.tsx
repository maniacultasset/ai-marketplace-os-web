import { createFileRoute, Navigate } from '@tanstack/react-router'
import { LayoutGrid } from 'lucide-react'
import { Page } from '@/components/app/page-header'
import { EmptyState } from '@/components/states/empty-state'
import { useNavItems } from '@/lib/nav'

/** '/' sends the user to the first nav item they can access. */
export const Route = createFileRoute('/_app/')({
  component: Home,
})

function Home() {
  const items = useNavItems()
  const first = items.find((i) => i.placement === 'main') ?? items[0]
  if (first) return <Navigate to={first.to} replace />
  return (
    <Page>
      <EmptyState
        icon={LayoutGrid}
        title="Nothing to show yet"
        description="No sections of the workspace are available for your role in this build."
      />
    </Page>
  )
}
