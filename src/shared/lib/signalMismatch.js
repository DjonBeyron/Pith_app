// Первый (самый левый) слот, где собранное значение не совпадает с
// ожидаемым — общая проверка для «Собери фразу» и ручной таблицы (сигналы
// ошибок, см. PROJECT.md). matches(actualToken, expectedToken) — своя сверка
// для каждой панели (у таблицы и «Собери фразу» разная форма токена и
// разная нормализация текста).
//
// Зовётся только на ПОЛНОСТЬЮ собранной последовательности (той же длины,
// что и expected) — до этого момента сверять нечего, см. TableManualPanel.jsx
// (автопроверка по длине) и usePhraseAssembly.js (кнопка «Проверить»
// работает и на неполном наборе, но сигналы там намеренно не смотрят на
// неполный ответ — см. комментарий в usePhraseAssembly.js).
//
// Возвращает индекс первого несовпавшего слота или null, если всё сошлось.
export function firstMismatchSlot(actual, expected, matches) {
  for (let i = 0; i < expected.length; i++) {
    if (!matches(actual[i] ?? null, expected[i])) return i
  }
  return null
}

// Куда переезжает мигающий индекс, когда ученик убирает чип с позиции
// removedIndex из собранной последовательности (см. useSignalState.js).
// Мигает КОНКРЕТНОЕ неверное слово, не позиция — снятие мигания должно
// ждать, пока уберут именно его, а не любой другой чип. Позиции ПОСЛЕ
// removedIndex сдвигаются на -1 (массив укорачивается splice'ом), поэтому
// blinkIndex нужно сдвигать вместе с реальным чипом, а не оставлять как
// застывший номер позиции.
export function nextBlinkIndex(blinkIndex, removedIndex) {
  if (blinkIndex == null) return null
  if (removedIndex === blinkIndex) return null
  if (removedIndex < blinkIndex) return blinkIndex - 1
  return blinkIndex
}
