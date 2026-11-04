// Ловушка-двойник «Вершины» (CONCEPT_RACE.md, раунд 3) — чистые функции без React.
//  • На подъёме не больше ОДНОЙ ловушки: на первой ступени, у слова которой есть двойники (plan.words[].confusers — те же, что в «Различи» и «Слушай и лови»). Треснутый камень стоит рядом с настоящим островом этой ступени,
//    на соседней дорожке на той же высоте; на нём двойник по-английски (его выбирает семя плана), перевода нет;
//  • сказал двойник на этой ступени (trapSaid: Vosk услышал двойник вместо слова) — камень осыпается, герой соскальзывает, как при промахе, Пит говорит «это двойник, а нужно слово»;
//  • сказал верно — камень проваливается сам (падает вниз и исчезает), прыжок на настоящий остров;
//  • двойник на другой ступени (там ловушки нет) — обычный промах.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { rngFor, rngInt } from '../rehearsal/rehearsalSeed.js'
import { laneOf, LANES } from './raceClimbCam.js'

export const TRAP_CRUMBLE_MS = 400 // камень осыпается
export const TRAP_FALL_MS = 500    // камень проваливается

const key = t => normText(t)

/** Дорожка ловушки ступени k: соседняя с дорожкой острова (крайние — к середине, средняя — влево или вправо по семени), никогда не та же */
export function trapLane(k, rng) {
  const own = laneOf(k)
  const near = [own - 1, own + 1].filter(l => l >= 0 && l < LANES)
  return near[rngInt(rng, near.length)]
}

/** Ловушка подъёма: { k, text, lane, state: 'stand', said: '', at: 0 } на первой ступени с двойниками, иначе null. words — слова фразы по порядку, doubles(слово) → двойники, seed — семя плана */
export function trapOf({ words, doubles, seed }) {
  const i = words.findIndex(w => (doubles(w) ?? []).length > 0)
  if (i < 0) return null
  const rng = rngFor(seed, 'race-trap')
  const list = doubles(words[i])
  return { k: i + 1, text: list[rngInt(rng, list.length)], lane: trapLane(i + 1, rng), state: 'stand', said: '', at: 0 }
}

/** Какого двойника слова word сказал человек (heard — что услышал Vosk); слово верное или двойника в услышанном нет — null */
export function trapSaid(heard, word, confusers = []) {
  const said = key(heard ?? '').split(' ').filter(Boolean)
  if (!said.length || said.includes(key(word))) return null
  return confusers.find(c => said.includes(key(c))) ?? null
}
