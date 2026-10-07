import { appendChar, typedMax } from '../../../../shared/lib/typeWordKeys.js'
import { normalizeAnswerText as normalize } from '../../../../shared/lib/tableCellMatch.js'

// Авто-ответ админа в «напечатай слово» (SolveCorrectButton): строка, которую
// получил бы ученик, нажав по очереди все буквы слова на клавиатуре панели —
// через тот же appendChar (первая буква заглавная, лимит typedMax, пробел не
// первым). Проверка (typedMatches) сравнивает без регистра, так что итог
// проходит как верный; пустое слово — '' (панель с таким и не рендерится).
export function typeWholeWord(word = '') {
  const max = typedMax(word)
  return [...normalize(word)].reduce((typed, ch) => appendChar(typed, ch, max), '')
}
