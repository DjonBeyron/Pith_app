import { describe, it, expect } from 'vitest'
import { diffTextEdit } from './textEditDiff.js'

describe('diffTextEdit — распознаёт правку между двумя состояниями текста', () => {
  it('без изменений — пустой диапазон', () => {
    expect(diffTextEdit('привет', 'привет', 6)).toEqual({ start: 0, end: 0, insertedLength: 0 })
  })

  it('вставка символа в середину', () => {
    // "привт" -> "привет" (вставили "е" перед "т", каретка встала за "е")
    const d = diffTextEdit('привт', 'привет', 5)
    expect(d).toEqual({ start: 4, end: 4, insertedLength: 1 })
  })

  it('вставка в конец строки', () => {
    const d = diffTextEdit('привет', 'привет!', 7)
    expect(d).toEqual({ start: 6, end: 6, insertedLength: 1 })
  })

  it('backspace убирает один символ', () => {
    // "привет" -> "привт" (удалили "е", каретка на месте удаления)
    const d = diffTextEdit('привет', 'привт', 4)
    expect(d).toEqual({ start: 4, end: 5, insertedLength: 0 })
  })

  it('forward-delete убирает символ впереди каретки (каретка не двигается)', () => {
    // "привет" -> "привт", курсор стоял перед "е" и остался там же
    const d = diffTextEdit('привет', 'привт', 4)
    expect(d).toEqual({ start: 4, end: 5, insertedLength: 0 })
  })

  it('вставка поверх выделения (paste-replace)', () => {
    // "раз два три" -> "раз XXXX три", заменили "два" на "XXXX"
    const d = diffTextEdit('раз два три', 'раз XXXX три', 8)
    expect(d).toEqual({ start: 4, end: 7, insertedLength: 4 })
  })

  it('неоднозначность на повторе символов разруливается кареткой', () => {
    // "аааа" -> "ааааа", лишняя "а" вставлена ПОСЛЕ второй буквы (каретка=3)
    const d = diffTextEdit('аааа', 'ааааа', 3)
    expect(d.insertedLength).toBe(1)
    expect(d.start).toBeLessThanOrEqual(3)
    expect(d.end - d.start).toBe(0)
  })

  it('стирание всего текста', () => {
    const d = diffTextEdit('привет', '', 0)
    expect(d).toEqual({ start: 0, end: 6, insertedLength: 0 })
  })

  it('без каретки (postCaret не передан) откатывается к концу строки', () => {
    const d = diffTextEdit('привет', 'привет!')
    expect(d).toEqual({ start: 6, end: 6, insertedLength: 1 })
  })
})
