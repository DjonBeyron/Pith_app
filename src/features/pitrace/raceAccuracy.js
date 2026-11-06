// Точность слова в итоге «Встряхни память» (CONCEPT_RACE.md, раздел 0, «Точность слова»): чистая функция от состояния гонки (raceState.js: sprint / catch = { words, results, r2 }), без React, DOM, часов и случайности.
// Результат пилюли (пишет редюсер raceState по событиям движка): { hit, miss, ms, late, trap, believed, life, fill, tap, wrong } — hit зачёт, miss был промах / «не успел», ms время ответа от выезда пилюли до зачёта,
// life окно жизни пилюли (мс от выезда до «не успел», по её скорости), fill заливка пилюли голосом в миг зачёта (0…1), tap ответ тапом, wrong — сколько раз на пилюле было «не то» (чужое слово голосом или тап по чужой пилюле).
//
// Формула. Оценка пилюли P (0…1):
//  • зачёта нет (молчал, не успел, промах без исправления) — P = 0;
//  • пилюля-ловушка прохода B (чужой перевод): промолчал — P = 1, поверил — P = 0;
//  • зачёт — P = W_RESULT·R + W_SPEED·S + W_CLEAN·C, где
//    (а) R — результат: с первой попытки 1, после промаха R_AFTER_MISS (0,5);
//    (б) S — скорость: 1 − ms / life (быстрее — выше, в последний миг — около 0); времени нет — S_UNKNOWN (0,5);
//    (в) C — чистота: max(0, 1 − WRONG_STEP·wrong); в голосе ещё × (1 − FILL_WEIGHT + FILL_WEIGHT·f), f = fill / FILL_CAP (насколько голос успел налить пилюлю; данных нет — f = 1).
// Оценка прохода (A — «скажи слово», B — «назови перевод»): среднее P пилюль слова в круге 1 (P1). Если слово было слабым (raceExtraRound.weakIn) и попало в дополнительный круг (P2 — среднее P там):
//    (г) проход = clamp(P1 − EXTRA_PENALTY + EXTRA_RECOVER·P2·(1 − P1)) — штраф за то, что круг понадобился, и частичное восстановление, если справился. Слово только в дополнительном круге (дежурное слово добора) — проход = P2.
//    Удавшееся слово, взятое в дополнительный круг добором, его результатом не меняется.
// Этап 2 «Фразы» (raceStatePhrases.phrasePart): каждый ход фразы со словом — чисто 1, нечисто (слово пропущено) 0,6, промах / «не успел» 0; среднее по ходам — ещё одна часть наравне с проходами.
// Точность слова = round(100 · среднее по проходам и фразам, где слово было); ни одного — 0. Уровень цвета (как ступени «Моей памяти», --lvl0…4): < 40 → 0, < 55 → 1, < 70 → 2, < 85 → 3, иначе 4.
import { failedIn, weakIn } from './raceExtraRound.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { ENTER_Y, SPEED, FILL_CAP } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { FAIL_Y } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { phrasePart } from './raceStatePhrases.js'

export const W_RESULT = 0.5
export const W_SPEED = 0.3
export const W_CLEAN = 0.2
export const R_AFTER_MISS = 0.5   // зачёт после промаха
export const S_UNKNOWN = 0.5      // зачёт без записанного времени
export const WRONG_STEP = 0.5     // каждое «не то» на пилюле снимает половину чистоты
export const FILL_WEIGHT = 0.5    // доля чистоты голоса, которую даёт заливка пилюли
export const EXTRA_PENALTY = 0.1  // понадобился дополнительный круг
export const EXTRA_RECOVER = 0.4  // какую часть недостающего возвращает дополнительный круг (по его оценке)
export const LEVEL_FROM = [40, 55, 70, 85] // границы уровней 1…4, %

const clamp01 = x => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)
const mean = xs => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0)

/** Окно жизни пилюли, мс: от выезда из-за верхнего края до «не успел» (FAIL_Y) при множителе скорости speed */
export const pillLifeMs = (speed = 1) => Math.round(((FAIL_Y - ENTER_Y) / (SPEED * (speed > 0 ? speed : 1))) * 1000)

/** Уровень цвета 0…4 по точности, % */
export const accLevel = pct => LEVEL_FROM.filter(x => pct >= x).length

/** Части оценки одной пилюли: { p, r, s, c } (r, s, c — null, если не считались) */
export function pillParts(res) {
  if (!res) return { p: 0, r: null, s: null, c: null }
  if (res.trap) return { p: failedIn(res) ? 0 : 1, r: null, s: null, c: null }
  if (!res.hit) return { p: 0, r: 0, s: 0, c: 0 }
  const r = res.miss ? R_AFTER_MISS : 1
  const life = res.life > 0 ? res.life : pillLifeMs(1)
  const s = Number.isFinite(res.ms) && res.ms >= 0 ? clamp01(1 - res.ms / life) : S_UNKNOWN
  const wrong = Number.isFinite(res.wrong) ? res.wrong : res.miss ? 1 : 0
  const f = !res.tap && Number.isFinite(res.fill) ? clamp01(res.fill / FILL_CAP) : 1
  const c = Math.max(0, 1 - WRONG_STEP * wrong) * (res.tap ? 1 : 1 - FILL_WEIGHT + FILL_WEIGHT * f)
  return { p: clamp01(W_RESULT * r + W_SPEED * s + W_CLEAN * c), r, s, c }
}

const indexesOf = (words, text) => (words ?? []).flatMap((w, i) => (normText(w) === normText(text) ? [i] : []))

/**
 * Проход pass (s.sprint или s.catch) для слова text → null (слова в проходе нет) или
 * { score 0…1, first: [результаты круга 1], extra: null | { results, done — все пилюли круга засчитаны } }
 */
export function passScore(pass, text) {
  const i1 = indexesOf(pass?.words, text), i2 = indexesOf(pass?.r2?.words, text)
  if (!i1.length && !i2.length) return null
  const first = i1.map(i => pass.results?.[i])
  const second = i2.map(i => pass.r2.results?.[i])
  const p2 = mean(second.map(r => pillParts(r).p))
  const extra = second.length ? { results: second, done: second.every(r => !failedIn(r)) } : null
  if (!first.length) return { score: clamp01(p2), first, extra }
  const p1 = mean(first.map(r => pillParts(r).p))
  const needed = !!extra && first.some(weakIn)
  return { score: needed ? clamp01(p1 - EXTRA_PENALTY + EXTRA_RECOVER * p2 * (1 - p1)) : clamp01(p1), first, extra: needed ? extra : null }
}

/** Точность слова text: { pct 0…100, level 0…4, a, b, f } (a / b — passScore проходов A и B, f — вклад фраз phrasePart; нет — null) */
export function wordAccuracy(race, text) {
  const a = passScore(race?.sprint, text), b = passScore(race?.catch, text), f = phrasePart(race?.phrases, text)
  const parts = [a, b, f].filter(Boolean)
  const pct = parts.length ? Math.round(100 * mean(parts.map(x => x.score))) : 0
  return { pct, level: accLevel(pct), a, b, f }
}

/** Слова итога (raceWeak.weakWords) с точностью: [{ ...слово, acc }] — слабые сверху (счёт слабости), при равном счёте — меньшая точность выше, дальше прежний порядок */
export function withAccuracy(race, words) {
  return (words ?? []).map((w, at) => ({ ...w, acc: wordAccuracy(race, w.text), at }))
    .sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || x.acc.pct - y.acc.pct || x.at - y.at)
    .map(({ at, ...w }) => w) // eslint-disable-line no-unused-vars
}
