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

describe('длину композиции можно подрезать на линейке', () => {
  const ruler  = read('./TableTimelineRuler.jsx')
  const editor = read('./TableTimelineEditor.jsx')

  it('за конец линейки можно тянуть, как за край клипа', () => {
    expect(ruler).toContain('className="tlRulerEnd"')
    expect(ruler).toContain('onMouseDown={startResize}')
    expect(editor).toContain('onResize={setLocalLen}')
  })

  it('масштаб фиксируется на момент захвата — длина не убегает от курсора', () => {
    const fn = ruler.slice(ruler.indexOf('function startResize'))
    expect(fn).toContain('const pxPerSec = rect.width / duration')
    expect(fn).toContain('(mv.clientX - rect.left) / pxPerSec')
  })

  it('длина не выходит за разумные границы', () => {
    expect(ruler).toContain('Math.max(1, Math.min(600, sec))')
  })

  it('то же значение правится числом в шапке — источник один', () => {
    expect(editor).toContain('const [localLen, setLocalLen]')
    expect(editor).toContain('const timelineDur = Math.max(1, localLen)')
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

describe('слова, поставленные на одно время', () => {
  it('одинаковые клипы дают одинаковый момент загорания', () => {
    expect(wordGreenAt({ start: 3.41, end: 4.41 }, 3.41))
      .toBe(wordGreenAt({ start: 3.41, end: 4.41 }, 3.41))
  })

  it('промах мышью на пару кадров почти не расходится по времени', () => {
    // раньше один слой попадал в «последние», другой нет — разница была 0.42с
    const a = wordGreenAt({ start: 3.41, end: 4.41 }, 3.41)
    const b = wordGreenAt({ start: 3.44, end: 4.44 }, 3.41)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('слово не зажигается раньше, чем уедет таблица', () => {
    expect(wordGreenAt({ start: 2, end: 8 }, 2)).toBeGreaterThanOrEqual(2 + EXTRA_AFTER_SLIDE_S - 1e-9)
    expect(wordGreenAt({ start: 5, end: 9 }, 2)).toBeCloseTo(5 + EXTRA_LEAD_IN_S, 5)
  })

  it('лид-ин не вылезает за клип — иначе слово не загорится вообще', () => {
    const clip = { start: 3.41, end: 4.41 }
    expect(clip.end - wordGreenAt(clip, 3.41)).toBeGreaterThanOrEqual(MIN_GLOW_S - 1e-9)
  })

  it('одинаковые слова получают разные чипы', () => {
    const layers = [
      { id: 'w1', word: 'a', clips: [{ start: 1, end: 2 }] },
      { id: 'w2', word: 'a', clips: [{ start: 1, end: 2 }] },
    ]
    const map = mapWordLayersToChips(layers, ['a', 'a'])
    expect(map.get('w1')).toBe('extra-0')
    expect(map.get('w2')).toBe('extra-1')
  })

  it('очередь падения в бокс — по порядку слов в ответе', () => {
    const order = ['not', 'a']
    expect(answerOrderOf('not', order)).toBeLessThan(answerOrderOf('a', order))
    expect(answerOrderOf('never', order)).toBeGreaterThan(answerOrderOf('a', order))
  })

  it('начало отъезда таблицы — самый ранний клип слова', () => {
    expect(extrasStartSec([
      { id: 'w1', word: 'a', clips: [{ start: 4, end: 5 }] },
      { id: 'w2', word: 'b', clips: [{ start: 2.5, end: 3 }] },
      { id: 'c1', cellId: 'c1', clips: [{ start: 0.2, end: 1 }] },
    ])).toBe(2.5)
    expect(extrasStartSec([])).toBe(null)
  })

  it('конец клипов слов известен — после него проверку можно не ждать', () => {
    expect(lastWordClipEnd([
      { id: 'w1', word: 'a', clips: [{ start: 1, end: 2 }] },
      { id: 'w2', word: 'b', clips: [{ start: 3, end: 4.5 }] },
      { id: 'w3', word: 'c', visible: false, clips: [{ start: 9, end: 10 }] },
    ])).toBe(4.5)
    expect(lastWordClipEnd([])).toBe(0)
  })

  it('плеер применяет эти правила и в прогоне, и после его конца', () => {
    const raf  = read('../../player/panels/table-dictator/useTableDictatorRaf.js')
    const post = read('../../player/panels/table-dictator/dictatorPostAudio.js')
    expect(raf).toContain('wordGreenAt(clip, firstExtraStart)')
    expect(raf).toContain('const nothingLeftToWait = wordsEnd > 0 && t >= wordsEnd + 0.5')
    expect(post).toContain('wordGreenAt(clip, extrasStart)')
    expect(post).toContain('answerOrderOf(a.word, extraFromAnswer)')
  })
})

describe('мерцание выбора идёт по длине слоя', () => {
  it('длиннее клип — дольше мигание, с разумными границами', () => {
    expect(flashDurationSec(1, 2.5)).toBe(1.5)
    // короткое свечение мигает ровно столько, сколько светится: иначе анимация
    // обрывалась на середине и выглядела рваной
    expect(flashDurationSec(1, 1.25)).toBeCloseTo(0.25, 5)
    expect(flashDurationSec(1, 1.01)).toBe(FLASH_MIN_S)
    expect(flashDurationSec(0, 30)).toBe(FLASH_MAX_S)
  })

  it('считается и для ячеек, и для слов, слой проверки не в счёт', () => {
    const { cells, chips } = buildFlashDurations([
      { id: 'c1', cellId: 'cell-1', clips: [{ start: 0, end: 1.4 }] },
      { id: 'w1', word: 'a', clips: [{ start: 3, end: 6 }] },
      { id: 'chk', isCheck: true, clips: [{ start: 7, end: 9 }] },
    ], ['a'])
    expect(cells.get('cell-1')).toBe(1.4)
    expect(chips.get('extra-0')).toBeCloseTo(6 - wordGreenAt({ start: 3, end: 6 }, 3), 5)
    expect(cells.size + chips.size).toBe(2)
  })

  it('задержка выезда чипов не сдвигает мерцание', () => {
    const chips = read('../../player/panels/table-dictator/TableExtraChips.jsx')
    expect(chips).toContain('...(green ? {} : chipStyles[i])')
  })

  it('разметка отдаёт длительность через переменную --td-flash', () => {
    expect(read('../../../shared/ui/TableGrid.jsx')).toContain("'--td-flash'")
    expect(read('../../../styles/table-grid.css')).toContain('animation: tableGridCellFlash var(--td-flash, 0.6s)')
    expect(read('../../../styles/player/panels/table-dictator.css')).toContain('animation: tableGridCellFlash var(--td-flash, 0.6s)')
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
