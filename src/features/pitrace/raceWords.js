// Слова «Гонки с Питом» из плана (RehearsalPlan, rehearsal/rehearsalPlan.js): какие слова едут в «Разгоне», в каком порядке и с какими переводами идёт «Слушай и лови», из каких слов фразы строится лестница «Вершины». Чистые функции, случайность — только
// от семени плана (rngFor, без Math.random), поэтому одна сессия воспроизводима.
//  • Разгон: слова фразы с карточкой и переводом, без служебных (warmupWords), «к повтору» первыми; если их меньше SPRINT_MIN — добираем словами с переводом из plan.extraWords, а нет их — из других фикстур (в будущем — из памяти);
//    дорожки строго по очереди слева направо (0, 1, 2, 0, 1, 2 …), скорость: первая ×1, каждая следующая на 5 % быстрее;
//  • Слушай и лови: слова разгона в другом порядке (по семени); у ~70 % пилюль перевод верный, у ~30 % — чужой (перевод другого слова раунда);
//  • Вершина: слова фразы по порядку (wordsOfChunk всех кусков), переводы на камнях — из карточек плана (climbHints).
import { warmupWords, wordsOfChunk } from '../rehearsal/rehearsalPlan.js'
import { orderWarmup } from '../rehearsal/rehearsalVariety.js'
import { isStopWord } from '../rehearsal/rehearsalStopWords.js'
import { FIXTURE_IDS, fixtureSource } from '../rehearsal/rehearsalFixtures.js'
import { rngFor, rngInt, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const SPRINT_MIN = 6      // меньше слов в «Разгоне» не бывает (если слов не хватает у плана, берём чужие)
export const SPRINT_MAX = 10
export const TRAP_SHARE = 0.3    // «Слушай и лови»: доля пилюль с ЧУЖИМ переводом (ловушки)
export const SPEED_STEP = 1.05   // каждая следующая пилюля «Разгона» быстрее на 5 %
export const MAX_VOCAB = 8       // слов словаря Vosk сверх целей

const key = t => normText(t)
const uniq = list => { const seen = new Set(); return list.filter(t => { const k = key(typeof t === 'string' ? t : t.text); if (!k || seen.has(k)) return false; seen.add(k); return true }) }
const fixtureWords = () => FIXTURE_IDS.flatMap(id => (fixtureSource(id).words ?? []).map(w => ({ text: w.text, translation: w.translation, due: false, lapses: 0, confusers: w.confusers ?? [], level: w.level ?? 1 })))

/** Слова с переводом, которыми добирают «Разгон»: plan.extraWords, нет их — слова других фикстур (без служебных и без слов самой фразы) */
export function extrasOf(plan) {
  const own = new Set([...plan.words.map(w => key(w.text)), ...plan.chunks.flatMap(wordsOfChunk).map(key)])
  const pool = plan.extraWords?.length ? plan.extraWords : fixtureWords()
  return uniq(pool.filter(w => w.translation && !isStopWord(w.text) && !own.has(key(w.text))))
}

/** Перевод слова: из слов плана, добора и фикстур; нет — null */
export function translationOf(plan, text) {
  return [...plan.words, ...(plan.extraWords ?? []), ...fixtureWords()].find(w => key(w.text) === key(text) && w.translation)?.translation || null
}

/** Слова «Разгона» по порядку выезда: [{ text, translation, due, confusers, idx, lane, speed }] */
export function sprintWords(plan) {
  const base = orderWarmup(warmupWords(plan), plan.seed).slice(0, SPRINT_MAX)
  const taken = new Set(base.map(w => key(w.text)))
  const more = extrasOf(plan).filter(w => !taken.has(key(w.text))).slice(0, Math.max(0, SPRINT_MIN - base.length))
  return [...base, ...more].map((w, idx) => ({ text: w.text, translation: w.translation, due: !!w.due, confusers: w.confusers ?? [], level: w.level ?? 1, idx, lane: idx % 3, speed: +(SPEED_STEP ** idx).toFixed(4) }))
}

/**
 * Слова «Слушай и лови» по порядку выезда (инверсия «Разгона»): те же слова, что в разгоне, но в другом порядке (по семени); дорожки по очереди, скорость +5 % за пилюлю. Пит говорит английское слово, на пилюле — русский перевод:
 * у ~70 % он верный (shown = перевод слова), у ~30 % (TRAP_SHARE, по семени; первая пилюля всегда верная) — ЧУЖОЙ: перевод другого слова раунда (trap: true, shown — чужой перевод, foreign — то слово).
 * → [{ text, translation, shown, trap, foreign, due, confusers, level, idx, lane, speed }]
 */
export function catchWords(plan, words = sprintWords(plan)) {
  const rng = rngFor(plan.seed, 'race-catch')
  const order = rngShuffle(rng, words)
  const traps = new Set(order.length > 1 ? rngShuffle(rng, order.slice(1).map((_, i) => i + 1)).slice(0, Math.max(1, Math.round(order.length * TRAP_SHARE))) : [])
  return order.map((w, idx) => {
    const others = order.filter(x => key(x.text) !== key(w.text) && x.translation && x.translation.trim().toLowerCase() !== w.translation.trim().toLowerCase()) // перевод кириллицей: normText его стирает, сравниваем как есть
    const f = traps.has(idx) && others.length ? others[rngInt(rng, others.length)] : null
    return { text: w.text, translation: w.translation, shown: f ? f.translation : w.translation, trap: !!f, foreign: f?.text ?? null, due: !!w.due, confusers: w.confusers ?? [], level: w.level ?? 1, idx, lane: idx % 3, speed: +(SPEED_STEP ** idx).toFixed(4) }
  })
}

/** Слова лестницы «Вершины»: слова всех кусков фразы по порядку (ступень k — первые k слов) */
export const climbWords = plan => plan.chunks.flatMap(wordsOfChunk)

/** Переводы слов лестницы по порядку (из карточек плана, plan.words): у слова без карточки — пустая строка (на камне только номер) */
export const climbHints = plan => climbWords(plan).map(w => plan.words.find(x => key(x.text) === key(w))?.translation ?? '')

/** Словарь Vosk сверх целей: переданные слова без целей и повторов, не больше MAX_VOCAB */
export function vocabOf(targets, extra = []) {
  const seen = new Set(targets.map(key))
  return extra.filter(t => { const k = key(t); if (!k || seen.has(k)) return false; seen.add(k); return true }).slice(0, MAX_VOCAB)
}
