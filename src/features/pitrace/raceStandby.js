// «Дежурные» слова игры «Встряхни память» (CONCEPT_RACE.md, «Дежурные слова»): пять слов с переводами и ступенями памяти в одном месте. Ими добирают дополнительный круг, когда удавшихся слов прохода меньше трёх,
// и заставку (разгон), когда у плана слов с переводом мало (raceWords.extrasOf). Пока вкладки «Моя память» нет, это общий запас; потом источник — слова из неё (план отдаст их в plan.extraWords, и они пойдут вместо этих).
// level — ступень памяти 0–4 (цвет --lvl0…--lvl4). Чистые данные и функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

const w = (text, translation, level, confusers = []) => ({ text, translation, due: false, lapses: 0, confusers, level })

export const STANDBY_WORDS = [
  w('meet', 'встретить', 1),
  w('nice', 'приятно', 3),
  w('remember', 'помнить', 1, ['remind']),
  w('where', 'где', 4),
  w('from', 'откуда', 3),
]

/** Дежурные слова, которых нет среди слов taken (тексты; сравнение как у слов плана): копии, чтобы никто не менял общий список */
export function standbyWords(taken = []) {
  const skip = new Set(taken.map(t => normText(typeof t === 'string' ? t : t?.text)))
  return STANDBY_WORDS.filter(x => !skip.has(normText(x.text))).map(x => ({ ...x, confusers: [...x.confusers] }))
}
