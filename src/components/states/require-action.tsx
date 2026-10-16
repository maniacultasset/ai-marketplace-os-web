import type { ReactNode } from 'react'
import { useMe } from '@/lib/auth'
import { useCan, type Policy } from '@/lib/permissions'
import { Forbidden } from './forbidden'

/**
 * Route guard: renders <Forbidden/> in place when the current user lacks `action` (a role action,
 * or 'platform:admin' for platform-admin-only screens).
 */
export function RequireAction({ action, children }: { action: Policy; children: ReactNode }) {
  const can = useCan()
  const me = useMe()
  if (!me.data) return null
  return can(action) ? children : <Forbidden />
}
