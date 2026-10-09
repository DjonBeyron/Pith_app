// Режим «Строго» модуля «Сказать фразу»: консенсус interim + final. Распознаватель применяет языковую модель к ФИНАЛЬНОМУ
// результату и может «домыслить» слово за ученика (сказал «try» — final «trying»), а промежуточный (interim) текст бывает
// буквальнее. Слово эталона засчитывается, только если оно есть И в final, И в последнем interim. Слова, которые появились
// ТОЛЬКО в final (движок исправил или дописал), считаются НЕ подтверждёнными (engineFixed).
// Если interim короче/пуст (iOS иногда не присылает interim) — полного консенсуса нет, решает один final.
// Режим «Строго» целиком (matchStrict) = консенсус И правило «первое увиденное» (firstSeenRule.js: ошибочная форма держалась в interim дольше порога
// выдержки или стояла на экране в момент конца речи): слово засчитывается, только если подтвердили оба. Чистые функции.
import { matchPhrase, tokenize } from './speechMatch.js'
import { firstSeenRule } from './firstSeenRule.js'
import { readSayDwell } from './sayDwell.js'

// Пересчёт итога по списку слов эталона items (после того как часть слов перестала считаться подтверждёнными)
function rescore(fin, items, keywords, passRatio) {
  const matched = items.filter(it => it.ok).map(it => it.word)
  const missed = items.filter(it => !it.ok).map(it => it.word)
  const ratio = items.length ? matched.length / items.length : 0
  const keys = [...new Set(keywords.flatMap(tokenize))].filter(k => items.some(it => it.word === k))
  const keysOk = keys.every(k => items.some(it => it.word === k && it.ok))
  return { ...fin, items, matched, missed, ratio, passed: items.length > 0 && ratio >= passRatio - 1e-9 && keysOk }
}

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
  return { ...rescore(fin, items, keywords, passRatio), consensus: true, engineFixed: items.filter(it => it.finalOnly).map(it => it.word) }
}

/**
 * «Строго» модуля: matchConsensus + правило «первое увиденное» по истории interim (history — view.history контроллера, dwellMs — порог мелькания; не задан —
 * настройка админа readSayDwell(): localStorage `pithy_say_dwell_v1`, по умолчанию 500 мс, 0 = любое появление ошибочной формы).
 * Слово, у которого ошибочная форма держалась дольше порога или стояла в конце речи, не засчитывается (dwellBlocked); такие слова добавляются в engineFixed.
 * @returns результат matchConsensus + { firstSeen (результат firstSeenRule), firstSeenBlocked: string[] }
 */
export function matchStrict(reference, finalText, interimText, history = [], keywords = [], passRatio = 1, opts = { exactWords: true }, dwellMs = readSayDwell()) {
  const base = matchConsensus(reference, finalText, interimText, keywords, passRatio, opts)
  const fs = firstSeenRule({ reference, history, final: { text: finalText }, lastInterim: interimText, dwellMs })
  const hit = base.items.filter(it => it.ok && fs.blocked.includes(it.word)).map(it => it.word)
  if (!hit.length) return { ...base, firstSeen: fs, firstSeenBlocked: [] }
  const items = base.items.map(it => (hit.includes(it.word) && it.ok ? { ...it, ok: false, heard: null, dwellBlocked: true } : it))
  return {
    ...rescore(base, items, keywords, passRatio), firstSeen: fs, firstSeenBlocked: [...new Set(hit)],
    engineFixed: [...new Set([...base.engineFixed, ...hit])],
  }
}
