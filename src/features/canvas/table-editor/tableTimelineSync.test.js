import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { answerWordsOutsideTable, sortTimelineLayers } from './tableGridUtils.js'
import { resultHoldSec, MIN_RESULT_S, mapWordLayersToChips, answerOrderOf, wordGreenAt, lastWordClipEnd, extrasStartSec, buildFlashDurations, flashDurationSec, FLASH_MIN_S, FLASH_MAX_S, MIN_GLOW_S, EXTRA_LEAD_IN_S, EXTRA_AFTER_SLIDE_S } from '../../../shared/lib/tableDictatorTiming.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const cell = (id, value) => ({ id, value })

describe('какие слова ответа живут вне таблицы', () => {
  const cells = [cell('c1', 'I'), cell('c2', 'am')]

  it('слово есть в таблице — своей дорожки не требует', () => {
    expect(answerWordsOutsideTable('I am', cells)).toEqual([])
  })

  it('слова вне таблицы возвращаются по порядку', () => {
    expect(answerWordsOutsideTable("I am I'm", cells)).toEqual(["I'm"])
  })

  it('повтор слова не съедает ту же ячейку дважды', () => {
    // вторая «I» ячейки уже не найдёт — значит ей нужна своя дорожка
    expect(answerWordsOutsideTable('I I', cells)).toEqual(['I'])
  })

  it('регистр не важен, пустой ответ ничего не даёт', () => {
    expect(answerWordsOutsideTable('i AM', cells)).toEqual([])
    expect(answerWordsOutsideTable('', cells)).toEqual([])
    expect(answerWordsOutsideTable(null, cells)).toEqual([])
  })
})

describe('порядок дорожек', () => {
  const cells = [
    { id: 'c1', col: 0, row: 0 }, { id: 'c2', col: 0, row: 1 },
    { id: 'c3', col: 1, row: 0 },
  ]
  const cellById = new Map(cells.map(c => [c.id, c]))
  const ids = list => sortTimelineLayers(list, cellById).map(l => l.id)

  const check = { id: 'check', isCheck: true }
  const word1 = { id: 'w1', word: "I'm" }
  const word2 = { id: 'w2', word: 'not' }
  const cellL = id => ({ id, cellId: id })

  it('«Проверить» внизу, даже если добавлена первой', () => {
    expect(ids([check, word1, cellL('c1')])).toEqual(['c1', 'w1', 'check'])
  })

  it('«Проверить» внизу и когда дорожки досыпали после неё', () => {
    expect(ids([cellL('c1'), check, word1, word2, cellL('c3')]))
      .toEqual(['c1', 'c3', 'w1', 'w2', 'check'])
  })

  it('ячейки идут по столбцам сверху вниз, слова — в порядке добавления', () => {
    expect(ids([word2, cellL('c3'), cellL('c2'), word1, cellL('c1'), check]))
      .toEqual(['c1', 'c2', 'c3', 'w2', 'w1', 'check'])
  })

  it('осиротевшая дорожка (ячейки уже нет) не лезет выше ячеек', () => {
    const orphan = { id: 'gone', cellId: 'cX' }
    expect(ids([orphan, cellL('c1'), check])).toEqual(['c1', 'gone', 'check'])
  })
})

describe('таймлайн подстраивается под правки автора', () => {
  const editor = read('./TableTimelineEditor.jsx')
  const model  = read('./useTableTimelineEdit.js')

  it('на смену ответа или ячеек заведены дорожки и уборка', () => {
    expect(editor).toContain('}, [answer, cells])')
    expect(editor).toContain('pruneLayers(')
    expect(editor).toContain('answerWordsOutsideTable(answer, cells)')
  })

  it('уборка сносит слова не из ответа и ячейки, которых нет', () => {
    const fn = model.slice(model.indexOf('const pruneLayers'))
    expect(fn).toContain('if (l.word)   return wordSet.has(l.word.toLowerCase())')
    expect(fn).toContain('if (l.cellId) return cellIdSet.has(l.cellId)')
    // слой «Проверить» не трогаем никогда
    expect(fn).toContain('if (l.isCheck) return true')
  })

  it('пустая таблица уборку не запускает — иначе снесло бы всё при загрузке', () => {
    expect(editor).toContain('if (!cells.length) return')
  })
})

describe('длина клипа «Проверить» = сколько виден результат', () => {
  it('длиннее слой — дольше держится момент', () => {
    expect(resultHoldSec(5, 7)).toBe(2)
    expect(resultHoldSec(5, 6.5)).toBe(1.5)
  })

  it('слишком короткий клип не съедает показ результата', () => {
    expect(resultHoldSec(5, 5.1)).toBe(MIN_RESULT_S)
  })

  it('слоя проверки нет — правило не применяется', () => {
    expect(resultHoldSec(5, null)).toBe(null)
    expect(resultHoldSec(null, 7)).toBe(null)
  })

  it('закрытие отсчитывается от момента проверки, а не от метки конца', () => {
    const raf  = read('../../player/panels/table-dictator/useTableDictatorRaf.js')
    const post = read('../../player/panels/table-dictator/dictatorPostAudio.js')
    expect(raf).toContain('setTimeout(() => closeRef.current?.(), hold * 1000)')
    expect(post).toContain('(checkTime - tEnd + hold) * 1000')
  })
})
