import type { ReactNode } from 'react'
import { useMe } from '@/lib/auth'
import { useCan, type Action } from '@/lib/permissions'
import { Forbidden } from './forbidden'

/** Route guard: renders <Forbidden/> in place when the current role lacks `action`. */
export function RequireAction({ action, children }: { action: Action; children: ReactNode }) {
  const can = useCan()
  const me = useMe()
  if (!me.data) return null
  return can(action) ? children : <Forbidden />
}
