// Слух фраз этапа 2 «Фразы» (CONCEPT_RACE.md, «Этап 2» → «Слух фраз»): чистый разбор услышанного против фраз-кандидатов. Без таймеров и Vosk — их ведёт racePhraseListen.js.
// Сопоставление — matchPhrase (speechMatch.js) по каждому кандидату; доля считается по СЛОВАМ кандидата (а не по токенам: «I'm» — одно слово фразы, хотя это два токена «i am»).
// СОКРАЩЕНИЯ (2026-11-08, журнал владельца: «итог «am trying to» · лучший «i'm trying to learn» ratio 0.50» — Vosk слышит «am» вместо «I'm»): сравнение двустороннее — tokenize раскрывает
// i'm / you're / it's / don't / let's / gonna / wanna в обе стороны (цель и услышанное); формы без апострофа (im, youre, dont, lets, wanna…) сводятся к ним (normForms); слово-сокращение цели
// считается сказанным и по своей «опорной» части (PART_OK: «am» зажигает «I'm») — onWord отдаёт его номер, заливка и маска идут по нему.
import { matchPhrase, tokenize } from '../../shared/lib/speech/speechMatch.js'
import { normForms, partOk } from './racePhraseForms.js'

export const PHRASE_OK = 0.75 // доля слов кандидата для зачёта: 3 из 4 — уже «сказал» (чисто или нет, решает движок по ratio)
export const PHRASE_GAP = 0.25 // лучший кандидат должен опережать второго хотя бы на столько (или совпасть полностью) — иначе ученик сказал общее начало нескольких фраз

/** Слова кандидата → какие из них услышаны: [bool] по словам. heard — накопленное услышанное (строка) */
export function wordHits(words, heard) {
  const ws = words.map(normForms)
  const r = matchPhrase(ws.join(' '), normForms(heard))
  const spans = ws.map(w => tokenize(w).length)
  const total = spans.reduce((a, b) => a + b, 0)
  if (total !== r.items.length) return ws.map((w, i) => !!r.items[i]?.ok) // числа и прочие «склейки» токенизатора: грубо по позиции
  let at = 0
  return spans.map((n, i) => { const its = r.items.slice(at, at + n); at += n; return n > 0 && (its.every(it => it.ok) || partOk(ws[i], its)) })
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
