import { wordLessonsOf } from '../../shared/lib/memory/wordLessons.js'

// Колоды повторения по словам: карточки ВСЕХ уроков слова (одно слово в
// разных модулях = одна память, PROJECT.md → «Память слова»). Фраза для
// спойлер-заголовка — название модуля, где слово встретилось первым.
//
// curricula: [{ id, title, lesson_ids }] (loadCurricula); lessons: [{ id, title,
// cards }] (listLessonCards) → Map(word → { phrase, cards: [{ id, nodes, lessonId }] })
export function buildDecks(curricula, lessons) {
  const decks = new Map()
  for (const [word, entries] of wordLessonsOf(curricula, lessons)) {
    const cards = entries.flatMap(({ lesson }) =>
      (Array.isArray(lesson.cards) ? lesson.cards : [])
        .filter(c => c?.id && c.nodes?.length)
        .map(c => ({ id: c.id, nodes: c.nodes, lessonId: lesson.id })))
    decks.set(word, { phrase: entries[0].module.title ?? '', cards })
  }
  return decks
}

// Сегодня по часам устройства — 'YYYY-MM-DD' (как ждёт pickToday)
export function localToday(now = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
