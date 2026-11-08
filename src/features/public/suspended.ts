import { isApiError } from '@/api/errors'

/** 403 TENANT_SUSPENDED after a correct sign-in (SI10): the brand's access is paused. */
export const isTenantSuspended = (e: unknown) => isApiError(e) && e.type === 'TENANT_SUSPENDED'
