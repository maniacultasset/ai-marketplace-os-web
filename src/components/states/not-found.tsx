import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './empty-state'

export function NotFound({
  title = 'Page not found',
  description = 'The page or item you are looking for does not exist in this brand.',
  backTo = '/',
  backLabel = 'Go to home',
}: {
  title?: string
  description?: string
  backTo?: string
  backLabel?: string
}) {
  return (
    <EmptyState
      icon={FileQuestion}
      title={title}
      description={description}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      }
    />
  )
}
