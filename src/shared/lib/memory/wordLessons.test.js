import { describe, it, expect } from 'vitest'
import { lessonWordOf, wordLessonsOf } from './wordLessons.js'

const lessons = [{ id: 's', title: 'Старт' }, { id: 'a', title: 'Keep' }, { id: 'b', title: 'Правило' }, { id: 'f', title: 'Финал' }]

describe('уроки-слова модуля', () => {
  it('слово урока — только между Стартом и Финалом и только слово латиницей', () => {
    expect(lessonWordOf(lessons, 'a')).toBe('keep')
    expect(lessonWordOf(lessons, 's')).toBe(null)
    expect(lessonWordOf(lessons, 'f')).toBe(null)
    expect(lessonWordOf(lessons, 'b')).toBe(null)
    expect(lessonWordOf(lessons, 'нет')).toBe(null)
    expect(lessonWordOf(null, 'a')).toBe(null)
  })

  it('одно слово в двух модулях — одна запись со всеми уроками', () => {
    const all = [...lessons, { id: 'a2', title: 'keep' }]
    const curricula = [
      { id: 'm1', lesson_ids: ['s', 'a', 'b', 'f'] },
      { id: 'm2', lesson_ids: ['s', 'a2', 'f'] },
    ]
    const byWord = wordLessonsOf(curricula, all)
    expect([...byWord.keys()]).toEqual(['keep'])
    expect(byWord.get('keep').map(x => x.lesson.id)).toEqual(['a', 'a2'])
  })
})
