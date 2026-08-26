import { normalizeAnswerText, cellMatchesWord } from '../../../../shared/lib/tableCellMatch.js'

// Какие ячейки таблицы ученик может нажать прямо сейчас (ручной режим).
//
// Раньше список допустимых ячеек считался по ID из разбора ответа
// (deriveAnswerTokens). На таблице вроде «to be» это ломалось: слово «was»
// стоит сразу в нескольких строках, разбор закреплял за ответом ПЕРВУЮ такую
// ячейку, а ученик жал ту, что в своей строке — и она просто не нажималась.
// Со стороны выглядело так, будто таблица зависла: список слов вне таблицы
// не появлялся, потому что «все ячейки» так и не были собраны.
//
// Теперь смотрим на ЗНАЧЕНИЯ: ячейка подходит, если её текст (или один из её
// вариантов) закрывает какой-то из ещё не собранных кусков ответа. Повторы
// учитываются по счёту: два «was» в ответе — два нажатия.

// Куски ответа, которые ещё предстоит собрать из таблицы
export function pendingCellValues(cellTokens, assembled) {
  const pool = assembled
    .filter(t => t.type === 'cell')
    .map(t => normalizeAnswerText(t.value))
  const rest = []
  for (const token of cellTokens) {
    const i = pool.indexOf(normalizeAnswerText(token.value))
    if (i >= 0) pool.splice(i, 1)
    else rest.push(token.value)
  }
  return rest
}

// Можно ли нажать эту ячейку сейчас
export function cellIsPickable(cell, cellTokens, assembled) {
  if (!cell) return false
  return pendingCellValues(cellTokens, assembled).some(v => cellMatchesWord(cell, v))
}

// Все нужные из таблицы куски собраны — пора показывать слова вне таблицы
export function allCellsPicked(cellTokens, assembled) {
  return cellTokens.length > 0 && pendingCellValues(cellTokens, assembled).length === 0
}
