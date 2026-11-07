import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Retired: the old single-product form had none of the V1 seller inputs. Old links and bookmarks
 * land on the guided form, which has all of them.
 */
export const Route = createFileRoute('/_app/products/new')({
  beforeLoad: () => {
    throw redirect({ to: '/add/guided', replace: true })
  },
})
