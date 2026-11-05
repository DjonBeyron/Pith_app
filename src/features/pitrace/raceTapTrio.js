// Режим «Тапаю» в игре «Встряхни память»: ТРИ пилюли вместо одной (CONCEPT_RACE.md, «Режим тапа»). Голосовой режим не меняется — одна пилюля на слово. Когда в попапе выбрано «Тапаю» (pithy_wl_tap_v1), в проходах A и B слово
// круга едет тремя пилюлями почти на одном уровне, по одной на дорожку: одна ВЕРНАЯ (перевод слова, Пит его называет — в «Разгоне» перевод, в «Слушай и лови» английское слово) и две ЧУЖИЕ (переводы других слов круга).
// Тап по верной дорожке — зачёт (взлёт, как после голоса), по чужой — ошибка (дрожь пилюли, miss), пропуск всех — «не успел» (fail). Скорость пилюль и +5 % те же: чужие едут с той же скоростью, что верная.
// Чистый модуль без React и DOM (проверяется в консоли, raceTapTrio.test.js): из ступени очереди (raceStageKit.queueStep) делает ступень для движка (верная пилюля всегда обычная: ловушка «Слушай и лови» в тапе не нужна — выбор и есть задание)
// и для каждого повтора — список чужих пилюль { lane, cap, dy }. Движок пилюль (useWordLanePills.js) выкатывает чужие рядом с верной; сдвиг dy — доля высоты экрана (по семени, ±TRIO_SHIFT %), поэтому три пилюли не стоят ровной линейкой.
// Случайность — только rngFor (по семени плана), поэтому одна сессия воспроизводима.
import { rngFor, rngShuffle } from '../rehearsal/rehearsalSeed.js'

export const TRIO_SHIFT = 8     // чужие пилюли сдвинуты по высоте относительно верной не больше чем на 8 % экрана (по семени)
export const TRIO_ACTS = ['sprint', 'catch'] // акты-очереди, где в режиме тапа три пилюли

const lc = t => String(t ?? '').trim().toLowerCase() // перевод кириллицей: normText его стирает, сравниваем как есть
const ACT_OK = stage => stage?.type === 'student' && TRIO_ACTS.includes(stage.act) && !!stage.words?.length

/** Слова других переводов для чужих пилюль: переводы слов плана и добора (plan.words, plan.extraWords) без повторов — запас на круги из двух-трёх слов */
export function transPool(plan) {
  const seen = new Set()
  return [...(plan?.words ?? []), ...(plan?.extraWords ?? [])].map(w => w.translation).filter(t => { const k = lc(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

/** Нужна ли стадии тройка пилюль: режим тапа включён (или проход B без русской модели, step.tapOnly) и это ступень прохода A / B */
export const trioFor = ({ tap, stage }) => (!!tap || !!stage?.step?.tapOnly) && ACT_OK(stage)

/**
 * Чужие пилюли одного повтора: две штуки на двух других дорожках, каждая — { lane, cap (чужой перевод), dy (% высоты экрана, ±TRIO_SHIFT) }.
 * words — слова круга (у каждого translation), i — номер повтора (= номер слова), lane — дорожка верной пилюли, pool — запас переводов.
 */
export function decoysOf({ seed, sid, words, i, lane, pool = [] }) {
  const rng = rngFor(seed, `race-trio-${sid}-${i}`)
  const right = lc(words[i]?.translation)
  const seen = new Set([right])
  const others = [...words.map(w => w.translation), ...pool].filter(t => { const k = lc(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
  const caps = rngShuffle(rng, others).slice(0, 2)
  const lanes = [0, 1, 2].filter(l => l !== lane)
  return lanes.map((l, j) => ({ lane: l, cap: caps[j] ?? '…', dy: +((rng() * 2 - 1) * TRIO_SHIFT).toFixed(2) }))
}

/**
 * Ступень для движка в режиме тапа: у каждого повтора верная пилюля с обычным переводом (cap = перевод слова, trap = false), плюс чужие пилюли. → { step, decoys: i => [{ lane, cap, dy }] } или null, если слов нет.
 * ctx = { seed, words (слова стадии), pool (transPool) }; step — ступень очереди (step.id, step.reps[i].lane).
 */
export function trioStep(step, ctx) {
  if (!step?.reps?.length || !ctx?.words?.length) return null
  const reps = step.reps.map((r, i) => ({ ...r, cap: ctx.words[i]?.translation ?? r.cap, trap: false }))
  const decoys = reps.map((r, i) => decoysOf({ seed: ctx.seed, sid: step.id, words: ctx.words, i, lane: r.lane ?? 0, pool: ctx.pool }))
  return { step: { ...step, reps }, decoys: i => decoys[i] ?? [] }
}

/** На сколько мс чужая пилюля впереди верной: сдвиг dy % высоты при скорости speed (множитель к pxSpeed — % высоты в секунду); отрицательное — чужая позади, выкатится позже */
export const shiftMs = (dy, speed, pxSpeed) => (dy / (pxSpeed * (speed > 0 ? speed : 1))) * 1000
