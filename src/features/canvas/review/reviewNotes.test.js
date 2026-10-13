import { describe, it, expect } from 'vitest'
import { buildNotesJson } from './reviewNotes.js'

const nodes = [
  { ref: 'a', seq: 1, type: 'text', data: { content: 'привет' } },
  { ref: 'b', seq: 2, type: 'text', data: { content: 'подсказка' } },
]
const items = [{ kind: 'node', ref: 'a', wrongBranch: false }, { kind: 'node', ref: 'b', wrongBranch: true }]

describe('buildNotesJson', () => {
  it('замечания по порядку ленты, с веткой, before/after; общие отдельно', () => {
    const j = buildNotesJson({ notes: [{ id: '2', ref: 'b', template: 'Другое', text: 'x' }, { id: '1', ref: 'a', template: '', text: 'y' }], general: [{ id: 'g', template: '', text: 'общее' }], items, nodes, lessonTitle: 'T' })
    expect(j.notes.map(n => [n.order, n.ref, n.branch, n.before, n.after, n.changed, n.comment])).toEqual([[1, 'a', 'основная', 'привет', 'привет', false, 'y'], [2, 'b', 'ветка ошибки', 'подсказка', 'подсказка', false, 'x']])
    expect(j.general).toEqual([{ template: '', comment: 'общее' }])
    expect(j.format).toBe('pithy-review-notes')
  })
  it('правки автора: before из оригинала, after текущий; правка без замечания идёт в edits_without_note', () => {
    const originals = new Map([['a', 'старый'], ['b', 'подсказка']])
    const j = buildNotesJson({ notes: [{ id: '1', ref: 'a', template: '', text: 'y' }], general: [], items, nodes, originals })
    expect(j.notes[0]).toMatchObject({ before: 'старый', after: 'привет', changed: true })
    expect(j.edits_without_note).toEqual([])
    const j2 = buildNotesJson({ notes: [], general: [], items, nodes, originals })
    expect(j2.edits_without_note.map(e => [e.ref, e.before, e.after])).toEqual([['a', 'старый', 'привет']])
  })
})
