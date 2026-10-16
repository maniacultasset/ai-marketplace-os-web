import { createFileRoute } from '@tanstack/react-router'
import { AgentRun } from '@/features/listing-flow/agent-run'

// 12 Agent run. The run id is the listing job id (GET /jobs/{id}); see features/listing-flow.
export const Route = createFileRoute('/_app/runs/$runId')({
  staticData: { title: 'Agent run' },
  component: RunPage,
})

function RunPage() {
  const { runId } = Route.useParams()
  return <AgentRun key={runId} runId={runId} />
}
