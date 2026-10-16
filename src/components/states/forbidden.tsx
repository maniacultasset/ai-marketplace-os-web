import { Link } from '@tanstack/react-router'
import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './empty-state'

/** Rendered in place (URL kept) when the role lacks the route's action. */
export function Forbidden({ description }: { description?: string }) {
  return (
    <EmptyState
      icon={ShieldOff}
      title="You don't have access to this page"
      description={description ?? 'Your role in this brand does not allow it. Ask an owner if you need access.'}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/home">Go to home</Link>
        </Button>
      }
    />
  )
}
