import { dailyCardBudget, cardsShownToday } from '../../shared/lib/memory/dailyPick.js'

// Админ → «Повторение»: почему слова «к повтору», а вкладка «Память» молчит («Памяти пора отдыхать»). Вкладка
// предлагает слово, только если (1) срок наступил, (2) у слова есть колода и (3) в бюджете дня («минут в день» → карточек)
// остались карточки — журнал повторений за сегодня уже мог его выбрать (learnView.js → pickToday). Чистая функция.
// rows — память [{ word, due_on }]; reviews — журнал; deckWords — Set слов с колодой
// → { due, ready, shown, budget, left, blocked: 'deck' | 'budget' | null }
export function diagnoseReview({ rows, reviews, minutes, deckWords, today }) {
  const due = rows.filter(r => r.due_on <= today)
  const ready = due.filter(r => deckWords.has(r.word))
  const shown = cardsShownToday(reviews, today)
  const budget = dailyCardBudget(minutes)
  const left = Math.max(0, budget - shown)
  const blocked = due.length && !ready.length ? 'deck' : ready.length && !left ? 'budget' : null
  return { due: due.length, ready: ready.length, shown, budget, left, blocked }
}
