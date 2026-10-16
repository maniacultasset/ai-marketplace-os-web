import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/features/home-inbox/home-page'

// Owner: home-inbox. Hi-fi 06 Home and 05 Home, first run (docs/DESIGN.md).
export const Route = createFileRoute('/_app/home')({
  staticData: { title: 'Home' },
  component: HomePage,
})
