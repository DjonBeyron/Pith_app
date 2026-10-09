// Слова «одной семьи» (try / trying / tried, go / goes): общая основа. Нужны проверке формы слова — правилу «первое увиденное» (firstSeenRule.js),
// диагностике исправлений движка в пробе «Голос» (attemptDiff.js). Чистая функция.
import { levenshtein } from './speechMatch.js'

const ENDING = /^[a-z]?(s|es|ed|d|ing|ly)$/ // окончание после основы: try → try+ing, go → go+es, run → run+ning

/** Слова «одной семьи»: общий префикс ≥ 3 букв, либо одно — основа другого + типовое окончание (go/goes), либо Левенштейн ≤ 3 (у слов от 4 букв либо от 3 с общими двумя первыми буквами) */
export function sameFamily(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  if (p >= 3) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 2 && l.startsWith(s) && ENDING.test(l.slice(s.length))) return true
  const d = levenshtein(a, b)
  return d <= 3 && (s.length >= 4 || (s.length >= 3 && p >= 2)) // try / tried / tries — да; to / do — нет
}
