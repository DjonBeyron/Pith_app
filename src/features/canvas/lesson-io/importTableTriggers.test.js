import { describe, it, expect } from 'vitest'
import { importLesson } from './importLesson.js'

const lesson = mode => ({
  format: 'pithy-lesson',
  nodes: [
    { ref: 'a', type: 'table', data: { mode, table: { rowCount: 1, colCount: 1, rows: [{ id: 'r', heightPct: 100 }], columns: [{ id: 'c', widthPct: 100 }], cells: [{ id: 'x', row: 0, col: 0, value: 'a' }] } }, triggers: [{ if: 'timer', ms: 2000, then: 'b' }] },
    { ref: 'b', type: 'text', data: { content: 'дальше' }, triggers: [] },
  ],
})

describe('импорт: переход у таблицы в режиме авто/ручной', () => {
  it('timer заменяется на table_correct (иначе холст теряет связь и лента обрывается)', () => {
    const r = importLesson(lesson('dictator'))
    const t = r.nodes[0].triggers
    expect(t.map(x => x.if)).toEqual(['table_correct', 'table_wrong'])
    expect(t[0].then).toBe(r.nodes[1].id)
    expect(r.warnings.join()).toMatch(/table_correct/)
  })
  it('в режиме показа таймер остаётся', () => {
    const r = importLesson(lesson('demo'))
    expect(r.nodes[0].triggers.map(x => x.if)).toEqual(['timer'])
  })
})
