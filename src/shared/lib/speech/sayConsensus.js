// Режим «Строго» модуля «Сказать фразу»: консенсус interim + final. Распознаватель применяет языковую модель к ФИНАЛЬНОМУ
// результату и может «домыслить» слово за ученика (сказал «try» — final «trying»), а промежуточный (interim) текст бывает
// буквальнее. Слово эталона засчитывается, только если оно есть И в final, И в последнем interim. Слова, которые появились
// ТОЛЬКО в final (движок исправил или дописал), считаются НЕ подтверждёнными (engineFixed).
// Если interim короче/пуст (iOS иногда не присылает interim) — полного консенсуса нет, решает один final. Чистые функции.
import { matchPhrase, tokenize } from './speechMatch.js'

/** interim «полный»: слов в нём не меньше, чем в final минус одно (считаем нормализованные слова: «I'm» = «i am») */
export function interimIsFull(interimText, finalText) {
  const ni = tokenize(interimText).length
  const nf = tokenize(finalText).length
  return ni > 0 && nf > 0 && ni >= nf - 1
}

/**
 * Как matchPhrase по final, но слова, найденные только в final, не засчитываются, когда interim полный.
 * @returns результат matchPhrase + { consensus: boolean (interim участвовал), engineFixed: string[] (слова эталона, подтверждённые только final) }
 */
export function matchConsensus(reference, finalText, interimText, keywords = [], passRatio = 1, opts = { exactWords: true }) {
  const fin = matchPhrase(reference, finalText, keywords, passRatio, opts)
  if (!interimIsFull(interimText, finalText)) return { ...fin, consensus: false, engineFixed: [] }
  const interim = matchPhrase(reference, interimText, [], 0, opts)
  const items = fin.items.map((it, i) => (it.ok && !interim.items[i]?.ok ? { ...it, ok: false, heard: null, finalOnly: true } : it))
  const engineFixed = items.filter(it => it.finalOnly).map(it => it.word)
  const matched = items.filter(it => it.ok).map(it => it.word)
  const missed = items.filter(it => !it.ok).map(it => it.word)
  const ratio = items.length ? matched.length / items.length : 0
  const keys = [...new Set(keywords.flatMap(tokenize))].filter(k => items.some(it => it.word === k))
  const keysOk = keys.every(k => items.some(it => it.word === k && it.ok))
  return {
    ...fin, items, matched, missed, ratio, consensus: true, engineFixed,
    passed: items.length > 0 && ratio >= passRatio - 1e-9 && keysOk,
  }
}
