import { describe, it, expect } from 'vitest'
import { buildLearnView, weekSummary, dueLabel, KNOW_STEP } from './learnView.js'
import { cardsShownToday } from '../../shared/lib/memory/dailyPick.js'

const today = '2026-09-25'
const at = (date, h = 12) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).toISOString()
const curricula = [
  { id: 'm1', title: "I'm trying to cook", lesson_ids: ['s1', 'l-try', 'l-to', 'l-cook', 'f1'] },
  { id: 'm2', title: 'Keep trying', lesson_ids: ['s2', 'l-try2', 'l-keep', 'f2'] },
  { id: 'm3', title: 'Чужая фраза', lesson_ids: ['s3', 'l-x', 'f3'] },
]
const lessons = [
  { id: 'l-try', title: 'trying', deck: 'c1' }, { id: 'l-to', title: 'to', deck: 'c2' },
  { id: 'l-cook', title: 'cook', deck: null }, { id: 'l-try2', title: 'Trying', deck: null },
  { id: 'l-keep', title: 'keep', deck: 'c3' }, { id: 'l-x', title: 'xray', deck: 'c4' },
]
const memory = [
  { word: 'trying', step: 3, due_on: today },
  { word: 'to', step: 1, due_on: '2026-09-24' },
  { word: 'cook', step: 2, due_on: today }, // без колоды — не в расписании
  { word: 'keep', step: 4, due_on: '2026-09-27' },
]

describe('вкладка «Моё обучение»: данные', () => {
  it('сегодня — созревшие слова с колодой; минут по карточкам', () => {
    const v = buildLearnView({ memory, curricula, lessons, minutes: 5 }, today)
    expect(v.today.picked.map(p => p.word)).toEqual(['to', 'trying'])
    expect(v.today.cards).toBe(3)
    expect(v.today.minutes).toBe(1)
    expect(v.next).toEqual({ date: '2026-09-27', count: 1 })
  })

  it('бюджет дня общий на все сессии: показанное сегодня вычитается', () => {
    const reviews = [
      { source: 'review', created_at: at(today), events: [{ cardId: 'a' }, { cardId: 'a' }, { cardId: 'b' }] },
      { source: 'review', created_at: at('2026-09-24'), events: [{ cardId: 'z' }] }, // вчера — не в счёт
      { source: 'feed', created_at: at(today), events: [{ cardId: 'q' }] },          // лента — отдельно
    ]
    expect(cardsShownToday(reviews, today)).toBe(2)
    const v = buildLearnView({ memory, curricula, lessons, reviews, minutes: 5 }, today) // 8 − 2 = 6
    expect(v.today.cards).toBe(3)
    const full = Array.from({ length: 8 }, (_, i) => ({ cardId: `c${i}` }))
    const done = buildLearnView({ memory, curricula, lessons, minutes: 5,
      reviews: [{ source: 'review', created_at: at(today), events: full }] }, today)
    expect(done.today.picked).toEqual([]) // бюджет исчерпан — «на сегодня всё»
  })

  it('карта: только фразы со словом в памяти; одно слово — одна колода на все модули', () => {
    const v = buildLearnView({ memory, curricula, lessons }, today)
    expect(v.phrases.map(p => p.title)).toEqual(["I'm trying to cook", 'Keep trying'])
    const [cookPhrase, keepPhrase] = v.phrases
    expect(cookPhrase.words).toEqual([
      { word: 'trying', lessonId: 'l-try', step: 3, due: today, hasDeck: true },
      { word: 'to', lessonId: 'l-to', step: 1, due: '2026-09-24', hasDeck: true },
      { word: 'cook', lessonId: 'l-cook', step: 2, due: today, hasDeck: false },
    ])
    // у урока «Trying» во втором модуле колоды нет, но у слова она есть
    expect(keepPhrase.words[0]).toMatchObject({ word: 'trying', hasDeck: true })
    expect(cookPhrase.due).toBe(true)
  })

  it('«знаю» — шаг ≥ 3; фраза «закреплена», когда все её слова «знаю»', () => {
    const v = buildLearnView({ memory, curricula, lessons }, today)
    expect(KNOW_STEP).toBe(3)
    expect(v.known).toBe(2)
    expect(v.strongPhrases).toBe(1) // Keep trying: trying 3, keep 4
    expect(buildLearnView({ curricula, lessons }, today).empty).toBe(true)
  })

  it('неделя и сроки словами', () => {
    expect(weekSummary([
      { source: 'review', word: 'to', created_at: at('2026-09-20'), step_before: 1, step_after: 2 },
      { source: 'review', word: 'to', created_at: at('2026-09-21'), step_before: 2, step_after: 1 },
      { source: 'review', word: 'cook', created_at: at('2026-09-21'), step_before: 2, step_after: 2 },
      { source: 'feed', word: 'x', created_at: at('2026-09-22'), step_before: 1, step_after: 2 },
    ])).toEqual({ days: 2, words: 2, grew: 1 })
    expect([today, '2026-09-26', '2026-09-28', '2026-10-20'].map(d => dueLabel(d, today)))
      .toEqual(['сегодня', 'завтра', 'через 3 дня', 'через 25 дней'])
  })
})
