import { createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/app/page-header'
import { RequireAction } from '@/components/states/require-action'
import { UploadForm } from '@/features/imports/upload-form'

export const Route = createFileRoute('/_app/imports/new')({ staticData: { title: 'Imports' }, component: NewImportPage })

function NewImportPage() {
  return (
    <Page>
      <PageHeader
        title="Import a spreadsheet"
        description="Add or update many products at once. You can leave while it runs."
        breadcrumbs={[{ label: 'Imports', to: '/imports' }, { label: 'Import a spreadsheet' }]}
      />
      <RequireAction action="product:import">
        <UploadForm />
      </RequireAction>
    </Page>
  )
}
