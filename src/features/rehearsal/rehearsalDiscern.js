// «Различи» репетиции (CONCEPT_REHEARSAL.md §8): подсказки раунда по семени плана. Формат подсказки тот же, что у discernPrompts (wordLaneRecipe.js): { id, parts, answer: [дорожка], slots, texts, stagger, lead }, но
// раскладка не фиксирована: какой двойник всплывёт и на какой дорожке стоит верное слово — случайно (rngFor(seed, 'discern-N')), числа берутся в фиксированном порядке. Чистые функции без React.
//  • первая подсказка — слово и ОДИН двойник (крайние дорожки 0 и 2); если двойников два — случайный из них; вторая — слово и все двойники (с двумя двойниками — три дорожки, с одним — снова две);
//  • верная дорожка — случайная из занятых; во второй подсказке — не та же, что в первой (верное слово «каждый раз на другой дорожке», как у обычного «Различи»);
//  • слова-двойники по дорожкам расставлены вперемешку.
import { DISCERN_LEAD_MS, DISCERN_STAGGER_MS, DISCERN_PROMPTS } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { rngFor, rngInt, rngShuffle } from './rehearsalSeed.js'

/** Подсказки слова word ({ text, confusers }) — по номеру слова в акте i; без двойников подсказок нет */
export function discernLayout(word, seed, i = 0) {
  const doubles = word.confusers ?? []
  if (!doubles.length) return []
  const rng = rngFor(seed, `discern-${i}`)
  const one = doubles[rngInt(rng, doubles.length)]
  let prev = -1
  return Array.from({ length: DISCERN_PROMPTS }, (_, j) => {
    const others = j === 0 ? [one] : doubles
    const slots = others.length >= 2 ? [0, 1, 2] : [0, 2]
    const free = slots.filter(l => l !== prev)
    const answer = free[rngInt(rng, free.length)]
    prev = answer
    const rest = rngShuffle(rng, others)
    const texts = ['', '', '']
    for (const lane of slots) texts[lane] = lane === answer ? word.text : rest.shift()
    return { id: `discern-0-${j}`, parts: [0], answer: [answer], slots, texts, stagger: DISCERN_STAGGER_MS, lead: DISCERN_LEAD_MS, text: word.text }
  })
}

/** Что показано в подсказках слова: «earn→2, earn+lean→0» (двойники → дорожка верного слова) — для журнала */
export const describeLayout = prompts => prompts.map(p => `${p.texts.filter((t, l) => t && l !== p.answer[0]).join('+')}→${p.answer[0]}`).join(', ')
