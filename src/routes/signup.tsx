import { createFileRoute, Outlet } from '@tanstack/react-router'

/** Public sign-up pages (no session needed): /signup and /signup/status. Each page renders its own frame. */
export const Route = createFileRoute('/signup')({ component: Outlet })
