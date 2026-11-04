// «Самые слабые слова» итога гонки (CONCEPT_RACE.md, «Финиш»): по результатам «Разгона» (состояние raceState.js: sprint = { words, caps, results, r2 }) строит список слов от самых слабых к самым сильным.
// Счёт слабости слова: пропуск или ошибка в первом круге = 2, во втором круге = 3, верно = 0 (бонуса за быстрый ответ нет). Цвет чипа — по счёту: красный (3 и больше), жёлтый (1–2), зелёный (0). Чистая функция без React.
import { failedIn } from './raceSprint2.js'

export const WEAK_MAX = 8      // чипов в итоге не больше
export const WEAK_R1 = 2       // ошибка в первом круге
export const WEAK_R2 = 3       // ошибка во втором круге
export const WEAK_RED = 3      // с этого счёта чип красный

/** Цвет чипа по счёту слабости: 'red' | 'yellow' | 'green' */
export const weakTone = score => (score >= WEAK_RED ? 'red' : score > 0 ? 'yellow' : 'green')

/**
 * sprint — состояние разгона. → [{ text, translation, score, tone }], самые слабые первыми (при равном счёте — по порядку выезда), не больше max.
 * Слово из второго круга сопоставляется с первым по тексту.
 */
export function weakWords(sprint, max = WEAK_MAX) {
  const words = sprint?.words ?? []
  const r2 = sprint?.r2
  const list = words.map((text, at) => {
    const j = r2?.words?.indexOf(text) ?? -1
    const score = (failedIn(sprint.results?.[at]) ? WEAK_R1 : 0) + (j >= 0 && failedIn(r2.results?.[j]) ? WEAK_R2 : 0)
    return { at, text, translation: sprint.caps?.[text] ?? '', score, tone: weakTone(score) }
  })
  return list.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max).map(w => ({ text: w.text, translation: w.translation, score: w.score, tone: w.tone }))
}
