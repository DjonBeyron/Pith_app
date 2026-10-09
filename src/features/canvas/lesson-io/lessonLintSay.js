import { readSayData, parseKeywords, keywordsMissingInPhrase, THRESHOLD_MIN, THRESHOLD_MAX } from '../../../shared/lib/speech/sayPhraseData.js'

const HINT_FIELDS = ['hintSilence', 'hintMismatch', 'hintPartial']

// «Сказать фразу» (say_phrase): пустая фраза, порог вне 50–100, ключевые слова не из фразы, нет текстовой ноды-задания перед
// модулем (рекомендация, не ошибка: модуль сам ничего в чат не пишет, фразу ученику даёт сообщение перед ним), две подряд,
// нода первая в уроке, неизвестные {подстановки} в подсказках чата. Правила — как в принципе из lessonRulesDefaults.js
export function checkSayPhrase(nodes, start) {
  const out = []
  const parentsOf = new Map()
  for (const n of nodes) for (const t of n.triggers ?? []) if (t.then) parentsOf.set(t.then, [...(parentsOf.get(t.then) ?? []), n])
  for (const n of nodes) {
    if (n.type !== 'say_phrase') continue
    const d = n.data ?? {}
    if (!readSayData(d).phrase) out.push(`${n.ref} say_phrase: пустая phrase — нечего проверять`)
    if (d.threshold != null && (Number(d.threshold) < THRESHOLD_MIN || Number(d.threshold) > THRESHOLD_MAX)) {
      out.push(`${n.ref} say_phrase: threshold ${d.threshold} вне ${THRESHOLD_MIN}–${THRESHOLD_MAX} — будет подтянут к границе`)
    }
    const lost = keywordsMissingInPhrase(d.phrase, d.keywords)
    if (parseKeywords(d.keywords).length && lost.length) {
      out.push(`${n.ref} say_phrase: ключевых слов нет во фразе (проверка их не учтёт): ${lost.join(', ')}`)
    }
    for (const f of HINT_FIELDS) {
      const bad = [...new Set(String(d[f] ?? '').match(/\{[^{}]*\}/g) ?? [])].filter(x => x !== '{ok}' && x !== '{missed}')
      if (bad.length) out.push(`${n.ref} say_phrase: в ${f} неизвестные подстановки ${bad.join(', ')} — работают только {ok} и {missed}`)
    }
    const parents = parentsOf.get(n.ref) ?? []
    if (n.ref === start?.ref) out.push(`${n.ref} say_phrase: стоит первой нодой урока — сначала нужна текстовая нода-задание`)
    else if (parents.some(p => p.type === 'say_phrase')) out.push(`${n.ref} say_phrase: идёт сразу после другой say_phrase — вставь между ними текстовую ноду-задание`)
    else if (parents.length && !parents.some(p => p.type === 'text')) {
      out.push(`${n.ref} say_phrase: перед ней нет текстовой ноды-задания — модуль сам ничего в чат не пишет и фразу не показывает, поэтому что и как сказать вслух должно объяснить сообщение перед ним (рекомендация)`)
    }
  }
  return out
}
