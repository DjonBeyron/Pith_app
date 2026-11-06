// Слова игры «Встряхни память» («Гонка с Питом») из плана (RehearsalPlan, rehearsal/rehearsalPlan.js): какие слова едут в «Разгоне», в каком порядке и с какими переводами идёт «Слушай и лови», из каких слов фразы строится лестница «Вершины». Чистые функции, случайность — только
// от семени плана (rngFor, без Math.random), поэтому одна сессия воспроизводима.
//  • Разгон: слова фразы с карточкой и переводом, без служебных (warmupWords), «к повтору» первыми; если их меньше SPRINT_MIN — добираем словами с переводом из plan.extraWords, а нет их — из других фикстур (в будущем — из памяти);
//    дорожки строго по очереди слева направо (0, 1, 2, 0, 1, 2 …), скорость: первая ×1, каждая следующая на 5 % быстрее; добор — дежурные слова (raceStandby.js);
//  • Проход B «назови перевод» (catch): слова прохода A в другом порядке (по семени); Пит говорит английское слово, на пилюле русский перевод этого слова, сказать нужно его (ловушек нет);
//  • Вершина: слова фразы по порядку (wordsOfChunk всех кусков), переводы на камнях — из карточек плана (climbHints).
import { warmupWords, wordsOfChunk } from '../rehearsal/rehearsalPlan.js'
import { orderWarmup } from '../rehearsal/rehearsalVariety.js'
import { isStopWord } from '../rehearsal/rehearsalStopWords.js'
import { FIXTURE_IDS, fixtureSource } from '../rehearsal/rehearsalFixtures.js'
import { rngFor, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { STANDBY_WORDS } from './raceStandby.js'

export const SPRINT_MIN = 6      // меньше слов в «Разгоне» не бывает (если слов не хватает у плана, берём чужие)
export const SPRINT_MAX = 10
export const SPEED_STEP = 1.05   // каждая следующая пилюля «Разгона» быстрее на 5 %
export const MAX_VOCAB = 8       // слов словаря Vosk сверх целей

const key = t => normText(t)
const uniq = list => { const seen = new Set(); return list.filter(t => { const k = key(typeof t === 'string' ? t : t.text); if (!k || seen.has(k)) return false; seen.add(k); return true }) }
const fixtureWords = () => FIXTURE_IDS.flatMap(id => (fixtureSource(id).words ?? []).map(w => ({ text: w.text, translation: w.translation, due: false, lapses: 0, confusers: w.confusers ?? [], level: w.level ?? 1 })))

/** Слова с переводом, которыми добирают «Разгон»: plan.extraWords, нет их — слова других фикстур (без служебных и без слов самой фразы) */
export function extrasOf(plan) {
  const own = new Set([...plan.words.map(w => key(w.text)), ...plan.chunks.flatMap(wordsOfChunk).map(key)])
  const pool = plan.extraWords?.length ? plan.extraWords : [...STANDBY_WORDS, ...fixtureWords()] // нет слов из памяти — дежурные слова (raceStandby.js), а если их не хватает (слова плана совпали с ними) — слова других фикстур
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
 * Слова прохода B «назови перевод» (инверсия прохода A, стадии catch) по порядку выезда: те же слова, что в проходе A, но в другом порядке (по семени); дорожки по очереди, скорость +5 % за пилюлю. Пит говорит английское слово (say),
 * shown — надпись пилюли прохода A (перевод); в проходе B пилюля несёт английское слово (text) — язык надписи = язык голоса Пита. Ловушек и чужих слов в голосе нет (решение владельца): trap всегда false.
 * → [{ text, translation, shown, trap, foreign, due, confusers, level, idx, lane, speed }]
 */
export function catchWords(plan, words = sprintWords(plan)) {
  const rng = rngFor(plan.seed, 'race-catch')
  return rngShuffle(rng, words).map((w, idx) => ({ text: w.text, translation: w.translation, shown: w.translation, trap: false, foreign: null, due: !!w.due, confusers: w.confusers ?? [], level: w.level ?? 1, idx, lane: idx % 3, speed: +(SPEED_STEP ** idx).toFixed(4) }))
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
