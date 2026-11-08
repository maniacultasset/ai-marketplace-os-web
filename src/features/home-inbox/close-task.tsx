/** "Mark done" / "Nothing to do" on an account task (SI9, ./close-task-api.ts). */
import { useState } from 'react'
import type { Schema } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { toast } from '@/lib/toast'
import { closeRefusal, useCloseTask, type Resolution } from './close-task-api'

type Task = Schema<'TaskOut'>

export function CloseTaskActions({ task }: { task: Pick<Task, 'id' | 'status'> & Partial<Pick<Task, 'resolution'>> }) {
  const can = useCan()
  const close = useCloseTask(task.id)
  const [refusal, setRefusal] = useState<string | null>(null)
  if (task.status !== 'open') return null
  // Backend SI9: tasks_close needs marketplace:connect (owner, admin). Others see who can.
  if (!can(OP_ACTION['POST /tasks/{task_id}/close'])) {
    return (
      <p className="text-caption text-ink-3" data-testid="task-close-who">
        An owner or admin can mark this done.
      </p>
    )
  }

  const run = (r: Resolution) => {
    setRefusal(null)
    close.mutate(r, {
      onSuccess: () => toast.success(r === 'done' ? 'Marked done' : 'Closed', { description: 'It leaves your open Inbox.' }),
      onError: (e) => setRefusal(closeRefusal(e)),
    })
  }
  const pending = close.isPending ? close.variables : null

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4" data-testid="task-close">
      <p className="text-small text-ink-2">Done what it asks in the marketplace? Mark it done. If nothing needs doing, close it.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button variant="secondary" disabled={close.isPending} onClick={() => run('done')} data-testid="task-mark-done">
          {pending === 'done' ? <Spinner data-icon="inline-start" /> : <Icon name="check" size={16} />}
          {pending === 'done' ? 'Saving…' : 'Mark done'}
        </Button>
        <Button variant="ghost" disabled={close.isPending} onClick={() => run('dismissed')} data-testid="task-dismiss">
          {pending === 'dismissed' ? 'Closing…' : 'Nothing to do'}
        </Button>
      </div>
      {refusal ? (
        <Banner tone="danger" role="alert">
          {refusal}
        </Banner>
      ) : null}
    </div>
  )
}
