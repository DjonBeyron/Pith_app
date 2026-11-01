// «Различи» репетиции (CONCEPT_REHEARSAL.md §8): подсказки раунда по семени плана. Формат подсказки тот же, что у discernPrompts (wordLaneRecipe.js): { id, parts, answer: [дорожка], slots, texts, stagger, lead }, но
// раскладка не фиксирована: какой двойник всплывёт и на какой дорожке стоит верное слово — случайно (rngFor(seed, 'discern-N')), числа берутся в фиксированном порядке. Чистые функции без React.
//  • в каждой подсказке ВСЕГДА три дорожки: верное слово и два других (решение владельца, v3.3.85): двойники слова (до двух; если их два — оба, в каждой подсказке), нехватку добирают слова фразы и двойники других слов (pool, как vocabFor в rehearsalStages.js);
//    только если во всей фразе и плане не набралось двух слов — дорожек меньше (одно слово без других слов вообще);
//  • верная дорожка — случайная из трёх; во второй подсказке — не та же, что в первой (верное слово «каждый раз на другой дорожке», как у обычного «Различи»);
//  • слова-двойники по дорожкам расставлены вперемешку;
//  • (v3.3.87, решение владельца) верное слово НЕ звучит перед тройкой (это слишком подсказывало): Пит сначала объясняет задание (rh_discern), три похожих слова написаны на пилюлях (written) и молчат (раньше они звучали по очереди),
//    а слово звучит ОДИН раз (sayAt) — когда открылась последняя пилюля и три дорожки уже на экране; до этого тап не засчитывается.
import { DISCERN_PROMPTS, MAX_CONFUSERS, normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { TRAVEL_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { rngFor, rngInt, rngShuffle } from './rehearsalSeed.js'

export const DISCERN_LEAD_MS = 400     // до первой пилюли: слова перед тройкой нет, ждать нечего
export const DISCERN_STAGGER_MS = 500  // шаг между пилюлями (молчат, поэтому чаще, чем в обычной игре)
export const SAY_AFTER_OPEN_MS = 200   // слово звучит через столько мс после того, как открылась последняя пилюля

/** Два других слова для подсказки: двойники слова, потом слова pool (слова фразы и двойники других слов) без повторов и без самого слова */
function pickOthers(word, pool, rng) {
  const seen = new Set([normText(word.text)])
  const take = list => rngShuffle(rng, list).filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
  return [...take(word.confusers ?? []), ...take(pool)].slice(0, MAX_CONFUSERS)
}

/** Подсказки слова word ({ text, confusers }) — по номеру слова в акте i; pool — слова, чем добить до двух других (нет двойников — подсказок нет) */
export function discernLayout(word, seed, i = 0, pool = []) {
  if (!(word.confusers ?? []).length) return []
  const rng = rngFor(seed, `discern-${i}`)
  let prev = -1
  return Array.from({ length: DISCERN_PROMPTS }, (_, j) => {
    const others = pickOthers(word, pool, rng)
    const slots = Array.from({ length: others.length + 1 }, (_, l) => l)
    const free = slots.filter(l => l !== prev)
    const answer = free[rngInt(rng, free.length)]
    prev = answer
    const rest = rngShuffle(rng, others)
    const texts = ['', '', '']
    for (const lane of slots) texts[lane] = lane === answer ? word.text : rest.shift()
    return { id: `discern-0-${j}`, parts: [0], answer: [answer], slots, texts, stagger: DISCERN_STAGGER_MS, lead: DISCERN_LEAD_MS, text: word.text, written: true, sayAt: DISCERN_LEAD_MS + (slots.length - 1) * DISCERN_STAGGER_MS + TRAVEL_MS + SAY_AFTER_OPEN_MS }
  })
}

/** Что показано в подсказках слова: «earn→2, earn+lean→0» (двойники → дорожка верного слова) — для журнала */
export const describeLayout = prompts => prompts.map(p => `${p.texts.filter((t, l) => t && l !== p.answer[0]).join('+')}→${p.answer[0]}`).join(', ')
