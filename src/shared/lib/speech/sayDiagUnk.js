// Админская диагностика «Сказать фразу»: подсветка «слово эталона Vosk не знает» (чистая функция, без React, словаря нет). Vosk компилирует грамматику из слов эталона и молча выбрасывает те,
// которых нет в словаре модели (например опечатка «buth» вместо «both»): настоящее «both» приходит как [unk], а слова эталона в сыром ответе нет — похоже на «Vosk не слышит последнее слово».
// Эвристика: не услышано слово эталона, Vosk его не выдал, и в сыром ответе ПОСЛЕ последнего принятого слова есть [unk] (услышал «что-то», но не из нашего списка).
import { tokenize } from './speechMatch.js'

/**
 * Слова эталона, которых, скорее всего, нет в словаре Vosk. a — последняя попытка (sayAttemptLast.get(): raw + verdict).
 * Берём недослышанные слова из ХВОСТА эталона (после последнего совпавшего), которых Vosk не выдал; их не больше, чем [unk] после последнего принятого слова.
 * @returns {string[]} слова эталона в нормализованном виде (пусто — подозрения нет)
 */
export function suspectedUnknownWords(a) {
  const rows = a?.raw?.rows
  const v = a?.verdict
  if (!rows?.length || !v?.missed?.length || !v.phrase) return []
  let lastOk = -1
  rows.forEach((w, i) => { if (!w.drop) lastOk = i })
  const unk = rows.slice(lastOk + 1).filter(w => w.drop === 'unk').length
  if (!unk) return []
  const missed = new Set(v.missed)
  const given = new Set(rows.flatMap(w => tokenize(w.word)))
  const ref = tokenize(v.phrase)
  let lastMatched = -1
  ref.forEach((t, i) => { if (!missed.has(t)) lastMatched = i })
  const tail = ref.slice(lastMatched + 1).filter(t => missed.has(t) && !given.has(t))
  return [...new Set(tail)].slice(0, unk)
}

/** Подсказка админу по одному слову эталона */
export const unknownWordHint = w => `Слово эталона «${w}» Vosk не знает — возможно опечатка в тексте фразы (проверьте написание в ноде; грамматика молча выбрасывает слова, которых нет в словаре модели).`
