import { wordKey } from '../wordAudio/wordKey.js'

// Уроки-слова модулей — как их понимает сервер (SQL is_word_lesson, миграция
// 20260924120000_word_memory.sql): урок стоит в модуле строго между первым
// (Старт) и последним (Финал), а его название — слово латиницей (wordKey).
// Одно слово в разных модулях — одна память, поэтому результат по ключу слова.
// Общий для отчёта «Колоды» в админке и для колод повторения.
//
// Слово урока модуля, если это урок-слово (строго между Стартом и Финалом,
// название — слово латиницей), иначе null. lessons — уроки модуля по порядку
// [{ id, title }]. Итог урока (карточка «Новое слово во временной памяти») и
// память гостя (seedGuestWordOf)
export function lessonWordOf(lessons, lessonId) {
  const i = (lessons ?? []).findIndex(l => l.id === lessonId)
  if (i <= 0 || i >= lessons.length - 1) return null
  return wordKey(lessons[i].title)
}

// curricula: [{ id, title, lesson_ids }]; lessons: [{ id, title, ... }]
// → Map(word → [{ lesson, module }]) — урок в двух модулях учитывается один раз
export function wordLessonsOf(curricula, lessons) {
  const lessonById = new Map((lessons ?? []).map(l => [l.id, l]))
  const byWord = new Map()
  for (const m of curricula ?? []) {
    const ids = Array.isArray(m.lesson_ids) ? m.lesson_ids : []
    if (ids.length <= 2) continue
    for (const id of ids.slice(1, -1)) {
      const lesson = lessonById.get(id)
      const word = lesson && wordKey(lesson.title)
      if (!word) continue
      if (!byWord.has(word)) byWord.set(word, [])
      const list = byWord.get(word)
      if (!list.some(x => x.lesson.id === id)) list.push({ lesson, module: m })
    }
  }
  return byWord
}
