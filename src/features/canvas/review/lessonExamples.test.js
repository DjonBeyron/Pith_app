import { describe, it, expect } from 'vitest'
import { exampleFromNote, exampleFromMark, goldenJson } from './lessonExamples.js'

describe('золотой набор: сборка записей', () => {
  it('exampleFromNote: правка текста → pair; без правки с замечаниями → bad; без всего → good', () => {
    const base = { lessonId: 'L', lessonTitle: 'To', ref: 'n3', seq: 3, type: 'text' }
    expect(exampleFromNote({ ...base, before: 'Верно!', after: 'Ага, в точку 😏', comments: [{ template: 'Звучит неестественно', comment: '' }] }))
      .toMatchObject({ kind: 'pair', before: 'Верно!', after: 'Ага, в точку 😏', comments: ['Звучит неестественно'], source: 'review' })
    expect(exampleFromNote({ ...base, before: 'Верно!', after: 'Верно!', comments: [{ template: 'Слишком длинно', comment: 'сократить' }] }))
      .toMatchObject({ kind: 'bad', before: 'Верно!', after: 'Верно!', comments: ['Слишком длинно: сократить'] })
    expect(exampleFromNote({ ...base, before: 'Ага, в точку 😏', after: 'Ага, в точку 😏' })).toMatchObject({ kind: 'good', comments: [] })
    // явный kind сильнее автоматики; у 'bad' after = before (правка не сохраняется как образец)
    expect(exampleFromNote({ ...base, before: 'a', after: 'b', kind: 'bad' })).toMatchObject({ kind: 'bad', after: 'a' })
  })

  it('exampleFromMark: 👍 → good без замечаний; остальное → bad с тегом и комментарием, источник — устройство', () => {
    const mark = { lessonId: 'L', nodeId: 'id9', seq: 9, type: 'audio', text: 'Скажи вслух', tag: 'robotic', comment: 'как робот', device: 'iPhone' }
    expect(exampleFromMark(mark, { lessonTitle: 'To' })).toMatchObject({ kind: 'bad', ref: 'id9', comments: ['Роботизированно: как робот'], tags: ['robotic'], source: 'phone:iPhone', lessonTitle: 'To' })
    expect(exampleFromMark({ ...mark, tag: 'great', comment: '' })).toMatchObject({ kind: 'good', comments: [], tags: ['great'] })
  })

  it('goldenJson: формат выгрузки без служебных id', () => {
    const j = goldenJson([{ id: 'x', kind: 'pair', lessonTitle: 'To', ref: 'n1', seq: 1, type: 'text', branch: 'основная', before: 'a', after: 'b', comments: [], tags: [], ruleTitle: '', source: 'review' }])
    expect(j.format).toBe('pithy-golden-set')
    expect(j.examples[0]).toEqual({ kind: 'pair', lesson: 'To', ref: 'n1', seq: 1, type: 'text', branch: 'основная', before: 'a', after: 'b', comments: [], tags: [], rule: '', source: 'review' })
    expect(j.examples[0].id).toBeUndefined()
  })
})
