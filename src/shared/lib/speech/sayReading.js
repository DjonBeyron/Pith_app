// Какое прочтение эталона сравнивать с услышанным. Если в фразе есть числа (numberWords.js), у эталона несколько допустимых прочтений («1998» → «nineteen ninety eight» /
// «one thousand nine hundred ninety eight», «0» → «zero» / «oh», «105» → с «and» и без). Берём то, что лучше совпало с услышанным (больше доля слов; при равенстве — основное, оно первое).
// Без цифр в эталоне или с одним прочтением — эталон как есть. Сложные числа (readingsOfText → null) сюда не доходят — такие фразы идут на системное, но если дошли, берём эталон как есть.
import { matchPhrase } from './speechMatch.js'
import { readingsOfText, hasDigits } from './numberWords.js'

/** Эталон для оценки: строка (прочтение фразы, лучше всего совпавшее с heard) */
export function pickReference(phrase, heard) {
  const p = String(phrase ?? '')
  if (!hasDigits(p)) return p
  const readings = readingsOfText(p)
  if (!readings || readings.length < 2) return p
  let best = readings[0]
  let bestRatio = -1
  for (const r of readings) {
    const ratio = matchPhrase(r, heard).ratio
    if (ratio > bestRatio + 1e-9) { best = r; bestRatio = ratio }
  }
  return best
}
