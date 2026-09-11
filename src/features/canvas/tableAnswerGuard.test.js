import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pruneTimelineForAnswerReset } from './table-editor/timelinePrune.js'
import { allCellsPicked } from '../player/panels/table-manual/manualCellPick.js'
import { deriveAnswerTokens } from '../../shared/lib/tableCellMatch.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Урок «Тест 1», нода 21: автор подставил сохранённый шаблон таблицы, а ответ
// остался от прежней — «He try to dance» при сетке «I / You,We,They / try».
// «He» уходит в слова вне таблицы честно: его в сетке нет. А если бы не
// совпало ни одно слово — ручной режим вставал бы намертво.
const cells = [
  { id: 'h1', value: 'Местоимения', isHeader: true },
  { id: 'ci', value: 'I' },
  { id: 'cy', value: 'You / We / They', options: ['You', 'We', 'They'] },
  { id: 'ct', value: 'try' },
]

describe('ручной режим не встаёт, когда ответ не пересекается с таблицей', () => {
  it('нода 21 как в базе: «He» вне таблицы, «try» — ячейка', () => {
    const t = deriveAnswerTokens('He try to dance', cells)
    expect(t.map(x => x.type)).toEqual(['extra', 'cell', 'extra', 'extra'])
  })

  it('ни одного совпадения — таблица считается пройденной сразу, а не никогда', () => {
    // Раньше false: ни чипов, ни «Проверить», таблица стоит и ничего не принимает
    const t = deriveAnswerTokens('He tries to dance', cells)
    expect(t.filter(x => x.type === 'cell')).toHaveLength(0)
    expect(allCellsPicked([], [])).toBe(true)
  })

  it('обычный случай не изменился: пока ячейки не набраны — false', () => {
    const t = deriveAnswerTokens('He try to dance', cells).filter(x => x.type === 'cell')
    expect(allCellsPicked(t, [])).toBe(false)
    expect(allCellsPicked(t, [{ type: 'cell', value: 'try' }])).toBe(true)
  })
})

describe('кнопка «Очистить ответ»', () => {
  const editor = read('./NodeTableAnswerCheck.jsx')
  const picker = read('./NodeTablePicker.jsx')

  it('стоит под полем ответа и стирает всё, что от него зависело', () => {
    expect(picker).toContain('<NodeTableAnswerCheck tData={tData} onDataChange={onDataChange} />')
    expect(editor).toContain("answer: '',")
    expect(editor).toContain('distractors: [],')
    expect(editor).toContain('pruneTimelineForAnswerReset(tData.timeline, cellIds)')
  })

  it('чистит дорожки слов и дорожки несуществующих ячеек, остальное не трогает', () => {
    const timeline = { layers: [
      { id: 1, cellId: 'ct', clips: [] },          // ячейка есть — остаётся
      { id: 2, cellId: 'a-try', clips: [] },       // ячейка старой сетки — уходит
      { id: 3, word: 'dance', clips: [] },         // слово старого ответа — уходит
      { id: 4, isCheck: true, clips: [] },         // проверка — про сетку, остаётся
    ] }
    const next = pruneTimelineForAnswerReset(timeline, new Set(cells.map(c => c.id)))
    expect(next.layers.map(l => l.id)).toEqual([1, 4])
    // Нечего чистить — тот же объект, лишней перерисовки нет
    expect(pruneTimelineForAnswerReset(next, new Set(cells.map(c => c.id)))).toBe(next)
  })

  it('предупреждает, какие слова не нашлись, и красным — если не нашлось ни одного', () => {
    expect(editor).toContain('Вне таблицы: ${missing.join')
    expect(editor).toContain('Ни одно слово ответа не найдено в таблице')
    expect(editor).toContain("nodeTableAnswerNote--bad")
  })
})

describe('новая таблица — ручной режим', () => {
  it('дефолт в данных новой ноды и миграция у ноды без сетки', () => {
    expect(read('./nodeGraph.js')).toContain("table:           { mode: 'manual' },")
    // Старые ноды без mode остаются диктантом — у них есть сетка/таймлайн
    expect(read('./NodeTablePicker.jsx')).toContain(
      "if (tData.mode == null && !tableData && !tData.timeline) onDataChange({ mode: 'manual' })")
  })
})
