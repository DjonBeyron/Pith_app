import { parsePattern } from '../../../shared/lib/speech/sayPattern.js'
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'
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
    // Свободная фраза (pattern): битый шаблон молча заменяется проверкой по эталону; голосовое с текстом у неё не записывается (системное распознавание)
    if (d.pattern && !parsePattern(d.pattern).ok) out.push(`${n.ref} say_phrase: шаблон pattern не разобрался (${parsePattern(d.pattern).error}) — проверка пойдёт по эталону`)
    if (readSayData(d).pattern && d.voiceReply === true) out.push(`${n.ref} say_phrase: у свободной фразы (pattern) voiceReply не работает — «голосовое с текстом» пишет только Vosk, а шаблон идёт на системное распознавание`)
    for (const s of d.signals ?? []) {
      if (s.slot !== 0) out.push(`${n.ref} say_phrase: у «Сказать фразу» один слот сигнала (0 — первая неудачная попытка), а указан ${s.slot}`)
      const hint = nodes.find(x => x.ref === s.ref)
      if (s.ref && !hint) out.push(`${n.ref} say_phrase: сигнал ссылается на несуществующую ноду ${s.ref}`)
      // Подсказка помогает, а не отвечает за ученика: слово/звук можно, всю фразу-эталон целиком — нет
      const want = tokenize(d.phrase).join(' ')
      const said = tokenize(hint?.data?.text ?? hint?.data?.content ?? '').join(' ')
      if (hint && tokenize(d.phrase).length >= 3 && said.includes(want)) out.push(`${n.ref} say_phrase: подсказка-сигнал ${s.ref} произносит всю фразу «${d.phrase}» — она должна помогать (слово, ударение), а не отвечать за ученика`)
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
