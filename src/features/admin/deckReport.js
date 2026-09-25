import { deckStatus } from '../reviewCards/reviewCardCopy.js'
import { wordLessonsOf } from '../../shared/lib/memory/wordLessons.js'

// Отчёт «Колоды» в админке (этап 3 системы повторения): какие слова без
// колоды или с колодой меньше минимума. Какие уроки считаются словами —
// wordLessonsOf (как SQL-триггер памяти); колода слова — карточки ВСЕХ его
// уроков (одно слово в разных модулях = одна память).

const ORDER = { none: 0, few: 1, ok: 2 }

// curricula: [{ id, title, lesson_ids }]; lessons: [{ id, title, cards }]
// → [{ word, status, cards, lessons: [{ id, title, moduleTitle, cards }] }]
export function buildDeckReport(curricula, lessons) {
  return [...wordLessonsOf(curricula, lessons)]
    .map(([word, entries]) => {
      const allCards = entries.flatMap(e => (Array.isArray(e.lesson.cards) ? e.lesson.cards : []))
      return {
        word,
        status: deckStatus(allCards),
        cards: allCards.filter(c => c?.nodes?.length).length,
        lessons: entries.map(({ lesson, module }) => ({
          id: lesson.id, title: lesson.title, moduleTitle: module.title,
          cards: Array.isArray(lesson.cards) ? lesson.cards.length : 0,
        })),
      }
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.word.localeCompare(b.word))
}
