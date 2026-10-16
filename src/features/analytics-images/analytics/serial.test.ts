import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serial'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createSerialQueue', () => {
  it('runs one task at a time, in order', async () => {
    const q = createSerialQueue(1)
    const log: string[] = []
    let running = 0
    let peak = 0
    const task = (id: string) => async () => {
      running++
      peak = Math.max(peak, running)
      log.push(`start ${id}`)
      await tick()
      log.push(`end ${id}`)
      running--
      return id
    }
    const out = await Promise.all([q.run(task('a')), q.run(task('b')), q.run(task('c'))])
    expect(out).toEqual(['a', 'b', 'c'])
    expect(peak).toBe(1)
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })

  it('a failed task frees its slot', async () => {
    const q = createSerialQueue(1)
    const a = q.run(() => Promise.reject(new Error('boom')))
    const b = q.run(() => Promise.resolve(2))
    await expect(a).rejects.toThrow('boom')
    await expect(b).resolves.toBe(2)
    expect(q.active()).toBe(0)
  })

  it('a task aborted while waiting never starts', async () => {
    const q = createSerialQueue(1)
    let release!: () => void
    const first = q.run(() => new Promise<void>((r) => (release = r)))
    const ctrl = new AbortController()
    let started = false
    const second = q.run(async () => {
      started = true
    }, ctrl.signal)
    ctrl.abort()
    release()
    await first
    await expect(second).rejects.toBeDefined()
    expect(started).toBe(false)
    expect(q.active()).toBe(0)
  })
})
