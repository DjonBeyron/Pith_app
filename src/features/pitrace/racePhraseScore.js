// Слух фраз этапа 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Слух фраз»): чистый разбор услышанного против фраз-кандидатов. Без таймеров и Vosk — их ведёт racePhraseListen.js.
// Сопоставление — matchPhrase (speechMatch.js) по каждому кандидату; доля считается по СЛОВАМ кандидата (а не по токенам: «I'm» — одно слово фразы, хотя это два токена «i am»).
import { matchPhrase, tokenize } from '../../shared/lib/speech/speechMatch.js'

export const PHRASE_OK = 0.75 // доля слов кандидата для зачёта: 3 из 4 — уже «сказал» (чисто или нет, решает движок по ratio)
export const PHRASE_GAP = 0.25 // лучший кандидат должен опережать второго хотя бы на столько (или совпасть полностью) — иначе ученик сказал общее начало нескольких фраз

/** Слова кандидата → какие из них услышаны: [bool] по словам. heard — накопленное услышанное (строка) */
export function wordHits(words, heard) {
  const r = matchPhrase(words.join(' '), heard)
  const spans = words.map(w => tokenize(w).length)
  const total = spans.reduce((a, b) => a + b, 0)
  if (total !== r.items.length) return words.map((w, i) => !!r.items[i]?.ok) // числа и прочие «склейки» токенизатора: грубо по позиции
  let at = 0
  return spans.map(n => { const ok = n > 0 && r.items.slice(at, at + n).every(it => it.ok); at += n; return ok })
}

/** Разбор по всем кандидатам: [{ key, hits: [bool], ratio }] в порядке кандидатов */
export function scorePhrases(phrases, heard) {
  return phrases.map(p => {
    const hits = p.words.length ? wordHits(p.words, heard) : []
    const ok = hits.filter(Boolean).length
    return { key: p.key, hits, ok, ratio: hits.length ? ok / hits.length : 0 }
  })
}

/**
 * Кто сказан: { key, ratio } или null. Лучший — больше доля, при равенстве больше совпавших слов (длиннее фраза).
 * Зачёт: доля лучшего ≥ PHRASE_OK и (совпал полностью и второй — не полностью, или разрыв со вторым ≥ PHRASE_GAP).
 * settled=false (идёт речь, ученик ещё может договорить) — только полное совпадение: 3 из 4 в черновике ждут конца речи.
 */
export function pickPhrase(scores, settled) {
  const sorted = [...scores].sort((a, b) => b.ratio - a.ratio || b.ok - a.ok)
  const [best, second] = sorted
  if (!best || best.ratio < PHRASE_OK - 1e-9) return null
  const rest = second?.ratio ?? 0
  const full = best.ratio >= 1 - 1e-9
  if (full && (rest < 1 - 1e-9 || best.ok > second.ok)) return best
  if (!settled) return null
  return best.ratio - rest >= PHRASE_GAP - 1e-9 ? best : null
}

/** Слова всех кандидатов без повторов (для словаря Vosk): нижний регистр, порядок первого появления */
export function unionWords(phrases) {
  const seen = new Set()
  const out = []
  for (const p of phrases) for (const w of p.words) { const k = String(w).toLowerCase().trim(); if (k && !seen.has(k)) { seen.add(k); out.push(w) } }
  return out
}

/** Строка журнала [phrase-ear] */
export function earLine(phrases, heard, scores, picked) {
  const best = [...scores].sort((a, b) => b.ratio - a.ratio)[0]
  const cands = phrases.map(p => p.words.join(' ')).join(' / ')
  const r = picked ?? best
  return `[phrase-ear] кандидаты ${cands} · услышал «${heard}» · лучший ${r ? `«${r.key}»` : '—'} ratio ${r ? r.ratio.toFixed(2) : '0'}${picked ? '' : ' · без совпадения'}`
}
