import { normalizeAnswerText as normalize, cellMatchesWord } from '../../../../shared/lib/tableCellMatch.js'
import { cellIsPickable } from './manualCellPick.js'

// Авто-ответ админа в ручной таблице (SolveCorrectButton): собранный бокс
// целиком, в форме, которую кладут tapCell/pickCell/tapExtra
// ({ type:'cell', cellId, value, key } | { type:'extra', value, key,
// distractorId }). Проверка (manualCheck.js) сверяет послотово с tokens —
// идём по ним в том же порядке.
//
// Ячейка под слот — по ЗНАЧЕНИЮ, а не по cellId из разбора (manualCellPick.js:
// на таблице «to be» одно «was» стоит в нескольких строках): сперва ячейка с
// таким текстом, потом — с таким вариантом в меню (в бокс уходит сам вариант,
// как при выборе из CellOptionsMenu). Одну ячейку дважды не берём (бокс хранит
// её по cellId), заголовки не нажимаются. Слово вне таблицы — чип из
// shuffledExtras с тем же текстом, тоже по одному разу. Чего-то не нашлось —
// null: данные ноды разошлись, панель не трогаем.
export function solveManualAssembly({ tokens = [], cells = [], shuffledExtras = [] }) {
  const usedCells = new Set()
  const usedExtras = new Set()
  const items = []
  for (const tok of tokens) {
    if (tok.type === 'cell') {
      const free = cells.filter(c => !usedCells.has(c.id) && cellIsPickable(c))
      const cell = free.find(c => normalize(c.value) === normalize(tok.value))
        ?? free.find(c => cellMatchesWord(c, tok.value))
      if (!cell) return null
      usedCells.add(cell.id)
      const value = normalize(cell.value) === normalize(tok.value)
        ? (cell.value ?? '').trim()
        : (cell.options ?? []).find(o => normalize(o) === normalize(tok.value))
      items.push({ type: 'cell', cellId: cell.id, value, key: `cell-${cell.id}` })
      continue
    }
    const idx = shuffledExtras.findIndex((chip, i) => !usedExtras.has(i) && normalize(chip.text) === normalize(tok.value))
    if (idx === -1) return null
    usedExtras.add(idx)
    items.push({ type: 'extra', value: shuffledExtras[idx].text, key: `extra-${idx}`, distractorId: shuffledExtras[idx].distractorId ?? null })
  }
  return items
}
