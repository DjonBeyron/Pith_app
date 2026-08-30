import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pendingCellValues, cellIsPickable, allCellsPicked } from './manualCellPick.js'
import { deriveAnswerTokens } from '../../../../shared/lib/tableCellMatch.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Кусок шаблона «to be»: слово «was» стоит в таблице несколько раз
const cells = [
  { id: 'c_i',   value: 'I' },
  { id: 'c_was1', value: 'was' },
  { id: 'c_she', value: 'She' },
  { id: 'c_was2', value: 'was' },
]
const tokensFor = answer => deriveAnswerTokens(answer, cells).filter(t => t.type === 'cell')
const picked = (...vals) => vals.map(v => ({ type: 'cell', value: v }))

describe('какие ячейки можно нажать (ручной режим)', () => {
  const cellTokens = tokensFor('She was trying to help you')

  it('разбор берёт первое попавшееся «was», но нажать можно любое', () => {
    expect(cellTokens.map(t => t.value)).toEqual(['She', 'was'])
    // ученик нажал «She», дальше жмёт «was» из СВОЕЙ строки — не то, что в разборе
    expect(cellIsPickable(cells[3])).toBe(true)
    expect(cellIsPickable(cells[1])).toBe(true)
  })

  it('после сбора всех кусков список слов вне таблицы открывается', () => {
    expect(allCellsPicked(cellTokens, picked('She'))).toBe(false)
    expect(allCellsPicked(cellTokens, picked('She', 'was'))).toBe(true)
  })

  // Считается КОЛИЧЕСТВО, а не совпадение: набрали не те ячейки — вторая
  // половина задания всё равно открывается, ошибку покажет проверка фразы
  it('неверно набранные ячейки тоже открывают слова вне таблицы', () => {
    expect(allCellsPicked(cellTokens, picked('I', 'was'))).toBe(true)
  })

  // Ошибиться ученик ДОЛЖЕН иметь возможность: пока нажимались только нужные
  // ячейки, таблица вела за руку по единственному верному пути, а проверка
  // фразы не могла ничего не проверить — неверных вариантов не существовало
  it('ячейка не из ответа тоже нажимается — ошибиться можно', () => {
    expect(cellIsPickable(cells[0])).toBe(true)
  })

  it('заголовок не нажимается: это подпись строки, а не слово ответа', () => {
    expect(cellIsPickable({ id: 'h', value: 'Местоимения', isHeader: true })).toBe(false)
  })

  it('пустая ячейка не нажимается', () => {
    expect(cellIsPickable({ id: 'e', value: '   ' })).toBe(false)
  })

  it('повтор слова в ответе требует двух нажатий', () => {
    const twice = [{ type: 'cell', value: 'was' }, { type: 'cell', value: 'was' }]
    expect(pendingCellValues(twice, picked('was'))).toEqual(['was'])
    expect(allCellsPicked(twice, picked('was', 'was'))).toBe(true)
  })

  it('регистр не мешает: «SHE» закрывает кусок «She»', () => {
    expect(pendingCellValues(cellTokens, picked('SHE'))).toEqual(['was'])
  })
})

describe('ответ ученика уходит в чат по галочке', () => {
  const panel = read('./TableManualPanel.jsx')

  it('верный ответ отправляется сразу', () => {
    expect(panel).toContain("if (phrase.trim()) onAnswerToChat?.(phrase, 'correct')")
  })

  it('неверный — один раз, последней из трёх попыток', () => {
    const tail = panel.slice(panel.indexOf('if (wrongCount.current >= 3) {'))
    expect(tail).toContain("onAnswerToChat?.(phrase, 'wrong_final')")
    // на первой и второй ошибке в чат ничего не уходит
    const middle = panel.slice(panel.indexOf('wrongCount.current += 1'), panel.indexOf('if (wrongCount.current >= 3) {'))
    expect(middle).not.toContain('onAnswerToChat')
  })

  it('галочка есть в редакторе ноды и проводка до панели', () => {
    expect(read('../../../canvas/NodeTablePicker.jsx')).toContain('sendAnswerToChat')
    expect(read('../../PlayerPanels.jsx')).toContain('tableNode.typeData?.table?.sendAnswerToChat')
  })

  it('пузыри ответа в ленте — те же, что у «собери фразу»', () => {
    expect(read('../../modules/table/TableModule.jsx')).toContain('<AnswerBubbles')
    expect(read('../../modules/phrase-assembly/PhraseAssemblyModule.jsx')).toContain('<AnswerBubbles')
  })
})
