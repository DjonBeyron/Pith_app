// «Самые слабые слова» итога гонки (CONCEPT_RACE.md, «Финиш»): по результатам обоих этапов — «Разгона» и «Слушай и лови» (состояние raceState.js: sprint / catch = { words, caps, results, r2 }) — строит список слов от самых слабых к самым сильным.
// Счёт слабости слова — сумма по этапам: пропуск или ошибка в первом круге = 2, во втором круге = 3, верно = 0 (бонуса за быстрый ответ нет). В «Слушай и лови» ошибкой считается и «поверил чужому переводу» (слово на пилюле-ловушке,
// записывается на слово, которое Пит произнёс), и ответ на пилюлю не тем словом, и пропуск верной пилюли. Цвет чипа — по счёту: красный (3 и больше), жёлтый (1–2), зелёный (0). Чистая функция без React.
import { failedIn } from './raceSprint2.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const WEAK_MAX = 8      // чипов в итоге не больше
export const WEAK_R1 = 2       // ошибка в первом круге
export const WEAK_R2 = 3       // ошибка во втором круге
export const WEAK_RED = 3      // с этого счёта чип красный

/** Цвет чипа по счёту слабости: 'red' | 'yellow' | 'green' */
export const weakTone = score => (score >= WEAK_RED ? 'red' : score > 0 ? 'yellow' : 'green')

/** Счёт слабости слова text на одном этапе (stage = { words, results, r2 }); слова нет на этапе — 0 */
function stageScore(stage, text) {
  const i = stage?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  if (i < 0) return 0
  const j = stage.r2?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  return (failedIn(stage.results?.[i]) ? WEAK_R1 : 0) + (j >= 0 && failedIn(stage.r2.results?.[j]) ? WEAK_R2 : 0)
}

/**
 * race — состояние гонки ({ sprint, catch }; для старых вызовов можно передать само состояние разгона — тогда это один этап). → [{ text, translation, score, tone }], самые слабые первыми
 * (при равном счёте — по порядку выезда в разгоне, слова только из «Слушай и лови» — после них), не больше max.
 */
export function weakWords(race, max = WEAK_MAX) {
  const stages = race?.sprint || race?.catch ? [race.sprint, race.catch].filter(Boolean) : [race].filter(Boolean)
  const seen = new Set()
  const list = []
  for (const st of stages) for (const text of st.words ?? []) {
    const k = normText(text)
    if (seen.has(k)) continue
    seen.add(k)
    const score = stages.reduce((a, x) => a + stageScore(x, text), 0)
    list.push({ at: list.length, text, translation: stages.map(x => x.caps?.[text]).find(Boolean) ?? '', score, tone: weakTone(score) })
  }
  return list.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max).map(w => ({ text: w.text, translation: w.translation, score: w.score, tone: w.tone }))
}
