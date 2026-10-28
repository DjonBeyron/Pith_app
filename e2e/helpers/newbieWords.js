import { curricula, cardNodes } from './newbieBackend.js'

// Несколько слов с переводом в «Памяти» новичка (кнопка «Скажи вслух» видна при ≥3 словах с переводом, PLAN_NEW_USER.md → E).
// Заглушка сети по умолчанию знает одно слово keep без перевода; здесь первой фразе ленты добавляем уроки-слова и перевод
// слов (`word_translations`), а таблице lessons — строки уроков с колодой. Использование: stubNewbieBackend(page, { tables: wordTables() }).
export const WORDS = [['keep', 'держать'], ['sleep', 'спать'], ['bread', 'хлеб']]
const lessonId = w => `nb-w-${w}`

export function wordTables(words = WORDS) {
  const first = { ...curricula[0], lesson_ids: ['nb-start', ...words.map(([w]) => lessonId(w)), 'nb-final'], word_translations: words.map(([w, t]) => ({ w, t })) }
  const rows = words.map(([w]) => ({ id: lessonId(w), title: w }))
  return {
    curricula: [first, ...curricula.slice(1)],
    lessons: query => {
      if (/deck:/.test(query)) return rows.map(r => ({ ...r, deck: 'nb-card' }))
      if (/cards:/.test(query)) return rows.map(r => ({ ...r, cards: [{ id: 'nb-card', nodes: cardNodes }], teacherMode: null, teacherName: null, teacherLogo: null, teacherLogoCrop: null }))
      return []
    },
  }
}

// Память гостя из этих слов: «повторить сегодня» (due_on — вчера), чтобы на вкладке «Память» были и слова, и главное действие
export function guestMemoryOf(words = WORDS) {
  const due = new Date(Date.now() - 86_400_000).toLocaleDateString('sv')
  return Object.fromEntries(words.map(([w]) => [w, { word: w, step: 1, due_on: due, last_card_id: null, reviews: 0, lapses: 0 }]))
}
