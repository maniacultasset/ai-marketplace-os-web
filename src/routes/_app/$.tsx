import { createFileRoute } from '@tanstack/react-router'
import { Page } from '@/components/app/page-header'
import { NotFound } from '@/components/states/not-found'

/** Unknown paths for signed-in users: not-found inside the shell. */
export const Route = createFileRoute('/_app/$')({
  staticData: { title: 'Not found' },
  component: () => (
    <Page>
      <NotFound />
    </Page>
  ),
})
