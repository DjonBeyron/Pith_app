// Слова «Гонки с Питом» из плана (RehearsalPlan, rehearsal/rehearsalPlan.js): какие слова едут в «Разгоне», какие три слова ловят в «Слушай и лови», из каких слов фразы строится лестница «Вершины». Чистые функции, случайность — только
// от семени плана (rngFor, без Math.random), поэтому одна сессия воспроизводима.
//  • Разгон: слова фразы с карточкой и переводом, без служебных (warmupWords), «к повтору» первыми; если их меньше SPRINT_MIN — добираем словами с переводом из plan.extraWords, а нет их — из других фикстур (в будущем — из памяти);
//    у каждой пилюли своя случайная дорожка и скорость: первая ×1, каждая следующая на 5 % быстрее;
//  • Слушай и лови: первые три слова разгона; в заходе три дорожки: верное слово и два других — двойники слова из памяти (confusers, если у них есть перевод: внутри пилюли русский текст), потом остальные слова раунда;
//  • Вершина: слова фразы по порядку (wordsOfChunk всех кусков).
import { warmupWords, wordsOfChunk } from '../rehearsal/rehearsalPlan.js'
import { orderWarmup } from '../rehearsal/rehearsalVariety.js'
import { isStopWord } from '../rehearsal/rehearsalStopWords.js'
import { FIXTURE_IDS, fixtureSource } from '../rehearsal/rehearsalFixtures.js'
import { rngFor, rngInt, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText, MAX_CONFUSERS } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const SPRINT_MIN = 6      // меньше слов в «Разгоне» не бывает (если слов не хватает у плана, берём чужие)
export const SPRINT_MAX = 10
export const CATCH_COUNT = 3     // заходов в «Слушай и лови»
export const SPEED_STEP = 1.05   // каждая следующая пилюля «Разгона» быстрее на 5 %
export const MAX_VOCAB = 8       // слов словаря Vosk сверх целей

const key = t => normText(t)
const uniq = list => { const seen = new Set(); return list.filter(t => { const k = key(typeof t === 'string' ? t : t.text); if (!k || seen.has(k)) return false; seen.add(k); return true }) }
const fixtureWords = () => FIXTURE_IDS.flatMap(id => (fixtureSource(id).words ?? []).map(w => ({ text: w.text, translation: w.translation, due: false, lapses: 0, confusers: w.confusers ?? [] })))

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
  const rng = rngFor(plan.seed, 'race-lanes')
  return [...base, ...more].map((w, idx) => ({ text: w.text, translation: w.translation, due: !!w.due, confusers: w.confusers ?? [], idx, lane: rngInt(rng, 3), speed: +(SPEED_STEP ** idx).toFixed(4) }))
}

/** Заходы «Слушай и лови» — по слову на заход: { word, text, texts[3], caps[3], answer (дорожка верного слова), slots, decoys }; раскладка по семени, верная дорожка не та же, что в прошлом заходе */
export function catchSets(plan, words = sprintWords(plan)) {
  let prev = -1
  return words.slice(0, CATCH_COUNT).map((w, i) => {
    const rng = rngFor(plan.seed, `race-catch-${i}`)
    const trap = w.confusers.map(text => ({ text, translation: translationOf(plan, text) })).filter(d => d.translation).slice(0, MAX_CONFUSERS) // ловушки: двойники слова из памяти — только с переводом (на пилюле русский текст: чужой английский выдал бы ответ)
    const others = rngShuffle(rng, words.filter(x => key(x.text) !== key(w.text))).map(x => ({ text: x.text, translation: x.translation }))
    const decoys = uniq([...trap, ...others]).filter(d => key(d.text) !== key(w.text)).slice(0, MAX_CONFUSERS)
    const slots = Array.from({ length: decoys.length + 1 }, (_, l) => l)
    const free = slots.filter(l => l !== prev)
    const answer = free[rngInt(rng, free.length)]
    prev = answer
    const rest = rngShuffle(rng, decoys)
    const texts = ['', '', ''], caps = ['', '', '']
    for (const lane of slots) { const d = lane === answer ? w : rest.shift(); texts[lane] = d.text; caps[lane] = d.translation }
    return { word: w, text: w.text, texts, caps, answer, slots, decoys: decoys.map(d => d.text) }
  })
}

/** Слова лестницы «Вершины»: слова всех кусков фразы по порядку (ступень k — первые k слов) */
export const climbWords = plan => plan.chunks.flatMap(wordsOfChunk)

/** Словарь Vosk сверх целей: переданные слова без целей и повторов, не больше MAX_VOCAB */
export function vocabOf(targets, extra = []) {
  const seen = new Set(targets.map(key))
  return extra.filter(t => { const k = key(t); if (!k || seen.has(k)) return false; seen.add(k); return true }).slice(0, MAX_VOCAB)
}
