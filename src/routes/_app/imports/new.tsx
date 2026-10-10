import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { UploadForm } from '@/features/imports/upload-form'

export const Route = createFileRoute('/_app/imports/new')({ component: NewImportPage })

function NewImportPage() {
  return (
    <Page>
      <PageHeader
        title="Import CSV"
        description="Create or update products in bulk. Rows are processed in the background; you can leave this page."
        breadcrumbs={[{ label: 'Imports', to: '/imports' }, { label: 'New import' }]}
      />
      <RequireAction action="product:import">
        <UploadForm />
      </RequireAction>
    </Page>
  )
}
