import { deriveAnswerTokens } from './tableCellMatch.js'

// Список слотов «Собери фразу» и «Таблица» (ручной режим) — общий для
// редактора холста (пикер signals у NodeTablePicker/NodePhraseAssemblyPicker,
// чтобы показать автору «слот N — вот это слово/ячейка») и для проверки
// ответа в плеере (TableManualPanel/manualCheck.js, usePhraseAssembly.js —
// чтобы понять, какой слот сигнала соответствует первому неверному месту).
//
// Слот НЕ переизобретается заново: для таблицы это тот же порядок токенов,
// что уже строит deriveAnswerTokens (см. tableCellMatch.js) — одна ячейка
// (даже «слитая» rowspan/colspan, потому что это один тап) или одно слово
// вне таблицы = один токен = один слот. Для «Собери фразу» слов не
// сливают — слот на слово, как они и лежат в node.typeData.phrase_assembly.words.

// phrase_assembly: один слот на слово в порядке ответа
export function phraseAssemblySlots(words) {
  return (words ?? []).map((w, i) => ({ index: i, label: w }))
}

// table (ручной режим): один слот на ячейку-токен ИЛИ слово вне таблицы —
// ровно то же разбиение, что уже использует сборка ответа в TableManualPanel
export function tableSlots(answer, cells) {
  return deriveAnswerTokens(answer, cells ?? []).map((t, i) => ({
    index: i,
    label: t.value,
    kind: t.type, // 'cell' | 'extra' — подпись в пикере, откуда слово
  }))
}

// Сигнал автора для конкретного слота (если есть и ссылается на живую ноду
// урока) — общий поиск для проверки ответа в обеих панелях. signals — сырое
// поле typeData.<table|phrase_assembly>.signals: [{slot, ref}], ref — id
// ноды-сигнала внутри ЭТОГО урока (не путать с экспортным ref вида "n3" —
// тот резолвится обратно в id при импорте, см. importLesson.js).
export function signalForSlot(signals, slotIndex, nodes) {
  const signal = (signals ?? []).find(s => s.slot === slotIndex)
  if (!signal) return null
  const node = (nodes ?? []).find(n => n.id === signal.ref)
  if (!node) return null
  return { signal, node }
}
