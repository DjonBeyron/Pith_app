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
      { source: 'feed', created_at: at(today), events: [{ cardId: 'q' }] },          // «Помнишь?» — тоже в бюджет
      { source: 'other', created_at: at(today), events: [{ cardId: 'x' }] },
    ]
    expect(cardsShownToday(reviews, today)).toBe(3)
    const v = buildLearnView({ memory, curricula, lessons, reviews, minutes: 5 }, today) // 8 − 3 = 5
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

  it('«Отпуск»: сегодня ничего не предлагается, карта на месте', () => {
    const v = buildLearnView({ memory, curricula, lessons, vacationSince: '2026-09-20' }, today)
    expect(v.vacation).toEqual({ since: '2026-09-20' })
    expect(v.today.picked).toEqual([])
    expect(v.phrases).toHaveLength(2)
    expect(buildLearnView({ memory, curricula, lessons }, today).vacation).toBe(null)
  })

  it('«знаю» — шаг ≥ 3; все слова фразы «знаю» → фраза к закреплению; собрана — золотая', () => {
    const v = buildLearnView({ memory, curricula, lessons }, today)
    expect(KNOW_STEP).toBe(3)
    expect(v.known).toBe(2)
    expect(v.inMemory).toBe(4)
    // Keep trying: trying 3, keep 4 — пора закрепить; «закреплено» — только собранные
    expect(v.today.phrase).toEqual({ id: 'm2', title: 'Keep trying', videoUrl: null })
    expect(v.strongPhrases).toBe(0)
    const done = buildLearnView({ memory, curricula, lessons, golden: new Set(['m2']) }, today)
    expect(done.strongPhrases).toBe(1)
    expect(done.today.phrase).toBe(null)
    expect(done.phrases.find(p => p.id === 'm2').golden).toBe(true)
    expect(buildLearnView({ memory, curricula, lessons, vacationSince: today }, today).today.phrase).toBe(null)
    expect(buildLearnView({ curricula, lessons }, today).empty).toBe(true)
  })

  it('неделя и сроки словами', () => {
    expect(weekSummary([
      { source: 'review', word: 'to', created_at: at('2026-09-20'), step_before: 1, step_after: 2 },
      { source: 'review', word: 'to', created_at: at('2026-09-21'), step_before: 2, step_after: 1 },
      { source: 'review', word: 'cook', created_at: at('2026-09-21'), step_before: 2, step_after: 2 },
      { source: 'feed', word: 'x', created_at: at('2026-09-22'), step_before: 1, step_after: 2 },
      { source: 'other', word: 'y', created_at: at('2026-09-23'), step_before: 1, step_after: 2 },
    ])).toEqual({ days: 3, words: 3, grew: 2, prevGrew: null })
    // С сегодняшней датой — последние 7 дней против 7 дней до них
    const two = [
      { source: 'review', word: 'a', created_at: at('2026-09-24'), step_before: 1, step_after: 2 },
      { source: 'review', word: 'b', created_at: at('2026-09-19'), step_before: 1, step_after: 2 },
      { source: 'review', word: 'c', created_at: at('2026-09-18'), step_before: 2, step_after: 3 }, // неделей раньше
      { source: 'review', word: 'd', created_at: at('2026-09-05'), step_before: 2, step_after: 3 }, // давно — не в счёт
    ]
    expect(weekSummary(two, today)).toEqual({ days: 2, words: 2, grew: 2, prevGrew: 1 })
    expect([today, '2026-09-26', '2026-09-28', '2026-10-20'].map(d => dueLabel(d, today)))
      .toEqual(['сегодня', 'завтра', 'через 3 дня', 'через 25 дней'])
  })
})
