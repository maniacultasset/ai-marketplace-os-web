import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { InboxPage } from '@/features/home-inbox/inbox-page'
import { inboxSearchSchema, type InboxSearch } from '@/features/home-inbox/model'

// Owner: home-inbox. Hi-fi 15 Inbox and 15b Inbox, mobile (docs/DESIGN.md).
export const Route = createFileRoute('/_app/inbox')({
  staticData: { title: 'Inbox', navCollapsed: true },
  validateSearch: inboxSearchSchema,
  component: InboxRoute,
})

function InboxRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/inbox' })
  const onSearch = (patch: Partial<InboxSearch>, opts: { replace?: boolean } = {}) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: opts.replace ?? false })
  return <InboxPage search={search} onSearch={onSearch} />
}
