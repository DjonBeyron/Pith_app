import { describe, it, expect } from 'vitest'
import { plural, sessionMinutes, introLine, summaryLine } from './reviewTeacher.js'
import { buildDecks, localToday } from './reviewDecks.js'

describe('строки учителя', () => {
  it('склонение и оценка минут', () => {
    expect([1, 2, 5, 11, 21, 22].map(n => plural(n, ['слово', 'слова', 'слов'])))
      .toEqual(['слово', 'слова', 'слов', 'слов', 'слово', 'слова'])
    expect(sessionMinutes(8)).toBe(2)
    expect(sessionMinutes(1)).toBe(1)
  })

  it('в начале: сколько слов и минут; путавшиеся слова — по памяти', () => {
    expect(introLine({ words: ['trying'], cards: 2 })).toBe('Сегодня 1 слово · около 1 мин. Поехали!')
    const memory = [{ word: 'to', lapses: 2 }, { word: 'for', lapses: 1 }, { word: 'cook', lapses: 0 }]
    expect(introLine({ words: ['to', 'for', 'cook'], cards: 8, memory }))
      .toBe('Сегодня 3 слова · около 2 мин. to и for уже путались — посмотрим, как сейчас.')
  })

  it('в итоге: что окрепло, что шатается; ранний повтор не «окреп»', () => {
    expect(summaryLine([
      { word: 'trying', outcome: 'good' }, { word: 'to', outcome: 'fail' }, { word: 'cook', outcome: 'good', applied: false },
    ])).toBe('trying окрепло, to шатается — вернёмся завтра.')
    expect(summaryLine([{ word: 'a', outcome: 'hard' }])).toBe('Слова держатся — так и продолжим.')
    expect(summaryLine(['a', 'b', 'c', 'd', 'e'].map(word => ({ word, outcome: 'know' }))))
      .toBe('a, b, c и ещё 2 окрепли.')
  })
})

describe('колоды повторения', () => {
  const curricula = [
    { id: 'm1', title: "I'm trying to cook", lesson_ids: ['s1', 'l1', 'l2', 'f1'] },
    { id: 'm2', title: 'Keep trying', lesson_ids: ['s2', 'l3', 'f2'] },
  ]
  const lessons = [
    { id: 'l1', title: 'Trying', cards: [{ id: 'a', nodes: [{ id: 'n' }] }, { id: 'empty', nodes: [] }] },
    { id: 'l2', title: 'cook', cards: null },
    { id: 'l3', title: 'trying', cards: [{ id: 'b', nodes: [{ id: 'n' }] }] },
  ]

  it('одно слово из двух модулей — одна колода; фраза — первый модуль; пустые карточки прочь', () => {
    const decks = buildDecks(curricula, lessons)
    expect(decks.get('trying')).toEqual({
      phrase: "I'm trying to cook",
      cards: [{ id: 'a', nodes: [{ id: 'n' }], lessonId: 'l1' }, { id: 'b', nodes: [{ id: 'n' }], lessonId: 'l3' }],
    })
    expect(decks.get('cook').cards).toEqual([])
  })

  it('дата устройства в формате YYYY-MM-DD', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
