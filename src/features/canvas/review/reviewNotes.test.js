import { describe, it, expect } from 'vitest'
import { buildNotesJson, changedRefs } from './reviewNotes.js'

const nodes = [
  { ref: 'a', seq: 1, type: 'text', data: { content: 'привет' } },
  { ref: 'b', seq: 2, type: 'text', data: { content: 'подсказка' } },
]
const items = [{ kind: 'node', ref: 'a', wrongBranch: false }, { kind: 'node', ref: 'b', wrongBranch: true }]

describe('buildNotesJson', () => {
  it('одна запись на ноду, по порядку ленты, с веткой и комментариями; общие отдельно', () => {
    const j = buildNotesJson({ notes: [{ id: '2', ref: 'b', template: 'Другое', text: 'x' }, { id: '1', ref: 'a', template: '', text: 'y' }, { id: '3', ref: 'a', template: 'Лучше текстом', text: '' }], general: [{ id: 'g', template: '', text: 'общее' }], items, nodes, lessonTitle: 'T' })
    expect(j.notes.map(n => [n.order, n.ref, n.branch, n.changed, n.comments.length])).toEqual([[1, 'a', 'основная', false, 2], [2, 'b', 'ветка ошибки', false, 1]])
    expect(j.general).toEqual([{ template: '', comment: 'общее' }])
  })
  it('только правка текста (без комментария) тоже попадает в notes, с before/after', () => {
    const originals = new Map([['a', 'старый'], ['b', 'подсказка']])
    const j = buildNotesJson({ notes: [], general: [], items, nodes, originals })
    expect(j.notes).toHaveLength(1)
    expect(j.notes[0]).toMatchObject({ ref: 'a', before: 'старый', after: 'привет', changed: true, comments: [] })
    expect(changedRefs(originals, nodes)).toEqual(['a'])
  })
  it('правка и замечание к одной ноде — одна запись', () => {
    const j = buildNotesJson({ notes: [{ id: '1', ref: 'a', template: '', text: 'y' }], general: [], items, nodes, originals: new Map([['a', 'старый']]) })
    expect(j.notes).toHaveLength(1)
    expect(j.notes[0]).toMatchObject({ changed: true, comments: [{ template: '', comment: 'y' }] })
  })
})
