// «Дежурные» слова игры «Встряхни память» (CONCEPT_RACE.md, «Дежурные слова»; этап 2 — «Данные: план из памяти»). Ими добирают дополнительный круг, когда удавшихся слов прохода меньше трёх, и заставку (разгон),
// когда у плана слов с переводом мало (raceWords.extrasOf). Источник — слова ДЕЖУРНЫХ ФРАЗ плана (plan.phrases с own: false — фразы первых трёх опубликованных модулей, plan/raceStandbyPhrases.js);
// пять слов STANDBY_WORDS ниже — только последний запас (нет сети, фикстура без фраз, тесты). level — ступень памяти 0–4 (цвет --lvl0…--lvl4). Чистые данные и функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

const w = (text, translation, level, confusers = []) => ({ text, translation, due: false, lapses: 0, confusers, level })

export const STANDBY_WORDS = [
  w('meet', 'встретить', 1),
  w('nice', 'приятно', 3),
  w('remember', 'помнить', 1, ['remind']),
  w('where', 'где', 4),
  w('from', 'откуда', 3),
]
export const STANDBY_MIN = 3 // меньше дежурных слов из фраз — добавляем запас STANDBY_WORDS

/** Слова дежурных фраз плана (own: false) с переводом, в формате слов плана, без повторов */
export function standbyPhraseWords(plan) {
  const seen = new Set()
  return (Array.isArray(plan?.phrases) ? plan.phrases : []).filter(p => p && !p.own).flatMap(p => p.words ?? [])
    .filter(x => { const k = normText(x?.text); if (!k || !x.translation || seen.has(k)) return false; seen.add(k); return true })
    .map(x => w(x.text, x.translation, Number.isFinite(x.level) ? x.level : 1))
}

/** Дежурные слова, которых нет среди слов taken (тексты; сравнение как у слов плана): слова дежурных фраз плана, а их меньше STANDBY_MIN — ещё и запас; копии, чтобы никто не менял общий список */
export function standbyWords(taken = [], plan = null) {
  const skip = new Set(taken.map(t => normText(typeof t === 'string' ? t : t?.text)))
  const fresh = list => list.filter(x => !skip.has(normText(x.text)))
  const own = fresh(standbyPhraseWords(plan))
  const keys = new Set(own.map(x => normText(x.text)))
  const pool = own.length >= STANDBY_MIN ? own : [...own, ...fresh(STANDBY_WORDS).filter(x => !keys.has(normText(x.text)))]
  return pool.map(x => ({ ...x, confusers: [...x.confusers] }))
}
