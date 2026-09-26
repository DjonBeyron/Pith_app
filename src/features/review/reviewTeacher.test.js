import { describe, it, expect } from 'vitest'
import { sessionMinutes, introLine, summaryLine } from './reviewTeacher.js'
import { buildDecks, cardFiles, localToday } from './reviewDecks.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'

describe('строки учителя', () => {
  it('оценка минут: ~15 с на карточку', () => {
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
    const t = decks.get('trying')
    expect(t.phrase).toBe("I'm trying to cook")
    expect(t.modules).toEqual([{ id: 'm1', title: "I'm trying to cook" }, { id: 'm2', title: 'Keep trying' }])
    expect(t.cards.map(c => [c.id, c.lessonId])).toEqual([['a', 'l1'], ['b', 'l3']])
    expect(decks.get('cook').cards).toEqual([])
  })

  it('у карточки — учитель её урока: свой у урока или общий', () => {
    const own = { ...lessons[2], teacherMode: 'custom', teacherName: 'Анна', teacherLogo: 'a.png' }
    const decks = buildDecks(curricula, [lessons[0], lessons[1], own])
    const [a, b] = decks.get('trying').cards
    expect(resolveTeacher(a.teacher, { name: 'Общий' }).name).toBe('Общий')
    expect(resolveTeacher(b.teacher, { name: 'Общий' })).toEqual({ name: 'Анна', logo: 'a.png', crop: null })
  })

  it('файлы карточки — из ссылок в нодах (для прогрева следующей карточки)', () => {
    expect(cardFiles([
      { type: 'photo', typeData: { photo: { file_id: 'f1', r2Url: 'https://r2/1.png' } } },
      { type: 'audio', typeData: { audio: { file_id: 'f2' } } }, // без ссылки — не прогреть
      { type: 'photo_choice', typeData: { photo_choice: { photos: [
        { fileId: 'f3', photoUrl: 'https://r2/3.png' }, { fileId: 'f1', photoUrl: 'https://r2/1.png' }] } } },
      { type: 'text', typeData: { text: { content: 'hi' } } },
    ])).toEqual([
      { id: 'f1', r2Url: 'https://r2/1.png', size: 0 },
      { id: 'f3', r2Url: 'https://r2/3.png', size: 0 },
    ])
    expect(buildDecks(curricula, lessons).get('trying').cards[0].files).toEqual([])
  })

  it('дата устройства в формате YYYY-MM-DD', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
