import { describe, expect, it } from 'vitest'
import { taskImageId } from './answer-spec'

describe('taskImageId', () => {
  it('takes the task image, else the first photo evidence, else none', () => {
    expect(taskImageId({ image_id: 'img-1', suggestions: [{ evidence_ref: 'image:img-2' }] })).toBe('img-1')
    expect(taskImageId({ image_id: null, suggestions: ['Cotton', { evidence_ref: 'doc:x' }, { evidence_ref: 'image:img-2' }] })).toBe('img-2')
    expect(taskImageId({ image_id: null, suggestions: [{ evidence_ref: 'image:' }, 'Cotton'] })).toBeNull()
  })
})
