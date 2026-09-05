import { describe, it, expect } from 'vitest'
import { buildCellTargets, buildWordTargets, matchWordTimingsToTargets } from './autoMontage.js'

const cell = (id, value, options) => ({ id, value, ...(options ? { options } : {}) })

describe('сопоставление слов озвучки с ячейками', () => {
  it('простая ячейка находится по времени своего слова', () => {
    const cells = [cell('c1', 'try')]
    const timings = [{ w: 'Мы', t: 0 }, { w: 'берём', t: 0.3 }, { w: 'try', t: 0.8 }, { w: 'без', t: 1.2 }]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.get('c1')).toEqual({ start: 0.8, end: 1.2 })
  })

  it('многословная ячейка ищется целиком («will try»)', () => {
    const cells = [cell('c1', 'will try')]
    const timings = [{ w: 'She', t: 0 }, { w: 'will', t: 0.4 }, { w: 'try', t: 0.7 }, { w: 'soon', t: 1.1 }]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.get('c1')).toEqual({ start: 0.4, end: 1.1 })
  })

  it('группа через запятую находится по первому произнесённому слову группы, даже с союзом «и» вместо запятой', () => {
    // Ровно случай из реального урока (n27): ячейка "he, she, it", а в
    // озвучке — "he, she и it" (русский союз вместо запятой перед последним).
    const cells = [cell('c1', 'he, she, it')]
    const timings = [
      { w: 'А', t: 0 }, { w: 'для', t: 0.2 },
      { w: 'he', t: 0.5 }, { w: 'she', t: 0.8 }, { w: 'и', t: 1.1 }, { w: 'it', t: 1.3 },
      { w: 'форма', t: 1.7 },
    ]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    // Находит только первое слово группы («he») — короткий, но верный черновик:
    // конец расширить руками на таймлайне (см. autoMontage.js — сознательное упрощение)
    expect(result.get('c1')).toEqual({ start: 0.5, end: 0.8 })
  })

  it('вариант особой ячейки (options) тоже считается совпадением', () => {
    const cells = [cell('c1', 'he, she, it', ['he', 'she', 'it'])]
    const timings = [{ w: 'she', t: 2 }, { w: 'tries', t: 2.4 }]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.get('c1')).toEqual({ start: 2, end: 2.4 })
  })

  it('слово вне таблицы (extra) находится так же, как ячейка', () => {
    const timings = [{ w: 'try', t: 0 }, { w: 'every', t: 0.5 }, { w: 'day', t: 0.9 }]
    const result = matchWordTimingsToTargets(timings, buildWordTargets(['every', 'day']))
    expect(result.get('every')).toEqual({ start: 0.5, end: 0.9 })
    expect(result.get('day')).toEqual({ start: 0.9, end: null }) // последнее слово записи
  })

  it('русские слова вокруг просто пропускаются, повтор ячейки не путает', () => {
    const cells = [cell('c1', 'I'), cell('c2', 'try')]
    const timings = [
      { w: 'С', t: 0 }, { w: 'I', t: 0.3 }, { w: 'мы', t: 0.6 }, { w: 'берём', t: 0.9 }, { w: 'try', t: 1.3 },
    ]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.get('c1')).toEqual({ start: 0.3, end: 0.6 })
    expect(result.get('c2')).toEqual({ start: 1.3, end: null })
  })

  it('пунктуация вокруг слова (как иногда отдаёт ElevenLabs) не мешает совпадению', () => {
    const cells = [cell('c1', 'try')]
    const timings = [{ w: 'try,', t: 0.5 }, { w: 'значит', t: 0.9 }]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.get('c1')).toEqual({ start: 0.5, end: 0.9 })
  })

  it('ничего не прозвучавшая ячейка (обычно заголовок) остаётся не найденной', () => {
    const cells = [cell('c1', 'Местоимения'), cell('c2', 'try')]
    const timings = [{ w: 'try', t: 0 }]
    const result = matchWordTimingsToTargets(timings, buildCellTargets(cells))
    expect(result.has('c1')).toBe(false)
    expect(result.get('c2')).toEqual({ start: 0, end: null })
  })
})
