import { describe, it, expect } from 'vitest'
import { buildNotesJson } from './reviewNotes.js'

const nodes = [
  { ref: 'a', seq: 1, type: 'text', data: { content: 'привет' } },
  { ref: 'b', seq: 2, type: 'text', data: { content: 'подсказка' } },
]
const items = [{ kind: 'node', ref: 'a', wrongBranch: false }, { kind: 'node', ref: 'b', wrongBranch: true }]

describe('buildNotesJson', () => {
  it('замечания идут по порядку ленты, с текстом ноды и веткой; общие отдельно', () => {
    const j = buildNotesJson({ notes: [{ id: '2', ref: 'b', template: 'Другое', text: 'x' }, { id: '1', ref: 'a', template: '', text: 'y' }], general: [{ id: 'g', template: '', text: 'общее' }], items, nodes, lessonTitle: 'T' })
    expect(j.notes.map(n => [n.order, n.ref, n.branch, n.content, n.comment])).toEqual([[1, 'a', 'основная', 'привет', 'y'], [2, 'b', 'ветка ошибки', 'подсказка', 'x']])
    expect(j.general).toEqual([{ template: '', comment: 'общее' }])
    expect(j.format).toBe('pithy-review-notes')
  })
  it('before/edited: правки автора видны как edited', () => {
    const j = buildNotesJson({ notes: [{ id: '1', ref: 'a', template: '', text: 'y', before: 'старый' }], general: [], items, nodes })
    expect(j.notes[0].content).toBe('старый')
    expect(j.notes[0].edited).toBe('привет')
  })
})
