/**
 * A FIFO limiter for one tenant's analytics reads. The backend lets a tenant run at most two
 * analytics requests at once (`services/analytics.INFLIGHT_CAP`; a third is 429 RATE_LIMITED), and
 * the capability probe may hold one slot, so the dashboard sends its own requests one at a time.
 */
export function createSerialQueue(concurrency = 1) {
  let active = 0
  const waiting: Array<() => void> = []

  const next = () => {
    if (active >= concurrency) return
    const start = waiting.shift()
    if (start) {
      active++
      start()
    }
  }

  function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        if (signal?.aborted) {
          active--
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
          next()
          return
        }
        task()
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      }
      waiting.push(start)
      next()
    })
  }

  return { run, pending: () => waiting.length, active: () => active }
}

export type SerialQueue = ReturnType<typeof createSerialQueue>
