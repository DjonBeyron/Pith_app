import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { pickToday, dailyCardBudget, cardsShownToday, localDate } from '../../shared/lib/memory/dailyPick.js'
import { sessionMinutes } from '../review/reviewTeacher.js'
import { plural } from '../../shared/lib/plural.js'

// Всё, что показывает вкладка «Моё обучение» (PROJECT.md → «Вкладки»), из
// сырых данных — чистая функция без сети:
//   today   — главное действие: что повторить сегодня (pickToday в пределах
//             ОСТАТКА бюджета дня — карточки, уже показанные сегодня, не
//             повторяются второй сессией) или «на сегодня всё»;
//   next    — когда следующее повторение, если сегодня нечего;
//   week    — строка итогов 7 дней;
//   phrases — карта памяти: фразы (модули со словом в памяти) → слова с силой;
//   known   — «Знаю N слов» (шаг ≥ 3 — слово пережило недельный интервал),
//   strongPhrases — фразы, где все слова «знаю».
export const KNOW_STEP = 3

// data: { memory: word_memory[], curricula: [{ id, title, lesson_ids }],
//         lessons: [{ id, title, deck }], reviews: review_events[], minutes }
export function buildLearnView({ memory = [], curricula = [], lessons = [], reviews = [], minutes = 5 }, today) {
  const byWord = new Map(memory.map(m => [m.word, m]))
  const lessonById = new Map(lessons.map(l => [l.id, l]))

  // Уроки-слова модулей по порядку в модуле; у слова есть колода, если она
  // есть хоть у одного его урока (одно слово в разных модулях = одна колода)
  const deckWords = new Set()
  const moduleWords = curricula.map(m => {
    const ids = Array.isArray(m.lesson_ids) && m.lesson_ids.length > 2 ? m.lesson_ids.slice(1, -1) : []
    const seen = new Set()
    const words = []
    for (const id of ids) {
      const l = lessonById.get(id)
      const word = l && wordKey(l.title)
      if (!word || seen.has(word)) continue
      seen.add(word)
      if (l.deck) deckWords.add(word)
      words.push({ word, lessonId: id })
    }
    return { id: m.id, title: m.title ?? '', words }
  })

  const hasDeck = w => deckWords.has(w)
  const shown = cardsShownToday(reviews, today)
  const left = Math.max(0, dailyCardBudget(minutes) - shown)
  const picked = pickToday(memory, { today, budget: left, canReview: hasDeck })
  const cards = picked.reduce((n, p) => n + p.cards, 0)

  const upcoming = memory.filter(m => m.due_on > today && hasDeck(m.word)).map(m => m.due_on).sort()
  const next = upcoming.length ? { date: upcoming[0], count: upcoming.filter(d => d === upcoming[0]).length } : null

  const phrases = moduleWords
    .map(m => ({
      ...m,
      words: m.words.map(w => {
        const mem = byWord.get(w.word)
        return { ...w, step: mem?.step ?? null, due: mem?.due_on ?? null, hasDeck: hasDeck(w.word) }
      }),
    }))
    .filter(m => m.words.some(w => w.step))
    .map(m => ({ ...m, due: m.words.some(w => w.step && w.hasDeck && w.due <= today) }))
    .sort((a, b) => (b.due - a.due) || a.title.localeCompare(b.title))

  return {
    empty: memory.length === 0,
    inMemory: memory.length,
    today: { picked, cards, minutes: sessionMinutes(cards), shown },
    next,
    week: weekSummary(reviews),
    phrases,
    known: memory.filter(m => m.step >= KNOW_STEP).length,
    strongPhrases: phrases.filter(p => p.words.every(w => (w.step ?? 0) >= KNOW_STEP)).length,
  }
}

// Итоги недели: дней с повторением, слов повторено, слов окрепло
export function weekSummary(reviews) {
  const rs = (reviews ?? []).filter(r => r.source === 'review')
  return {
    days: new Set(rs.map(r => localDate(r.created_at))).size,
    words: new Set(rs.map(r => r.word)).size,
    grew: new Set(rs.filter(r => (r.step_after ?? 0) > (r.step_before ?? 0)).map(r => r.word)).size,
  }
}

// Через сколько дней срок: 'сегодня' | 'завтра' | 'через 3 дня'
export function dueLabel(due, today) {
  if (!due) return ''
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`
}
