import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { deckStatus } from '../reviewCards/reviewCardCopy.js'

// Отчёт «Колоды» в админке (этап 3 системы повторения): какие слова без
// колоды или с колодой меньше минимума. Урок-слово — как в SQL-триггере
// памяти (миграция 20260924120000_word_memory.sql): стоит в модуле строго
// между первым (Старт) и последним (Финал) уроком, название — латиница
// (wordKey). Колода слова — карточки ВСЕХ его уроков (одно слово в разных
// модулях = одна память), поэтому группируем по ключу слова.

const ORDER = { none: 0, few: 1, ok: 2 }

// curricula: [{ id, title, lesson_ids }]; lessons: [{ id, title, cards }]
// → [{ word, status, cards, lessons: [{ id, title, moduleTitle, cards }] }]
export function buildDeckReport(curricula, lessons) {
  const lessonById = new Map((lessons ?? []).map(l => [l.id, l]))
  const byWord = new Map()
  for (const m of curricula ?? []) {
    const ids = Array.isArray(m.lesson_ids) ? m.lesson_ids : []
    if (ids.length <= 2) continue
    for (const id of ids.slice(1, -1)) {
      const l = lessonById.get(id)
      const word = l && wordKey(l.title)
      if (!word) continue
      if (!byWord.has(word)) byWord.set(word, { word, lessons: [], allCards: [] })
      const entry = byWord.get(word)
      if (entry.lessons.some(x => x.id === id)) continue // урок в двух модулях — один раз
      const cards = Array.isArray(l.cards) ? l.cards : []
      entry.lessons.push({ id, title: l.title, moduleTitle: m.title, cards: cards.length })
      entry.allCards.push(...cards)
    }
  }
  return [...byWord.values()]
    .map(({ word, lessons: ls, allCards }) => ({
      word, lessons: ls, status: deckStatus(allCards), cards: allCards.filter(c => c?.nodes?.length).length,
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.word.localeCompare(b.word))
}
