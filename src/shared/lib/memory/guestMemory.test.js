import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { localDate } = await import('./dailyPick.js')
const localToday = () => localDate(new Date())
const {
  applyReview, addDays, intervalFor, seedGuestWord, reviewGuestWord, listGuestMemory, listGuestReviews,
  hasGuestMemory, clearGuestMemory, seedGuestWordOf,
} = await import('./guestMemory.js')

const today = '2026-09-25'
const row = (step, due_on = today) => ({ word: 'to', step, due_on, reviews: 0, lapses: 0 })
const mid = () => 0.5 // разброс 0 дней

describe('шаги памяти гостя — как на сервере (memory_review_word)', () => {
  it('интервалы 1/3/7/16/35, даты через границу месяца', () => {
    expect([1, 2, 3, 4, 5].map(intervalFor)).toEqual([1, 3, 7, 16, 35])
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays(today, -30)).toBe('2026-08-26')
  })

  it('good/know — шаг +1; на шаге 5 — поддержка 60 дней', () => {
    expect(applyReview(row(1), 'good', today, mid).row).toMatchObject({ step: 2, due_on: '2026-09-28' })
    expect(applyReview(row(2), 'know', today, mid).row).toMatchObject({ step: 3, due_on: '2026-10-02' })
    expect(applyReview(row(5), 'good', today, mid).row).toMatchObject({ step: 5, due_on: addDays(today, 60) })
  })

  it('hard — шаг тот же; again −1 и fail −2 — завтра, не ниже 1; lapses растут', () => {
    expect(applyReview(row(3), 'hard', today, mid).row).toMatchObject({ step: 3, due_on: '2026-10-02' })
    const again = applyReview(row(3), 'again', today)
    expect(again.row).toMatchObject({ step: 2, due_on: '2026-09-26', lapses: 1 })
    expect(applyReview(row(2), 'fail', today).row.step).toBe(1)
  })

  it('верно раньше срока — шаг не двигается (applied=false), ошибка снижает всегда', () => {
    const early = applyReview(row(2, '2026-09-27'), 'good', today, mid)
    expect(early.applied).toBe(false)
    expect(early.row).toMatchObject({ step: 2, due_on: '2026-09-27', reviews: 1 })
    expect(applyReview(row(2, '2026-09-27'), 'fail', today).row.step).toBe(1)
  })

  it('разброс ±1 день — только от 7 дней', () => {
    expect(applyReview(row(2), 'good', today, () => 0).row.due_on).toBe(addDays(today, 6))
    expect(applyReview(row(2), 'good', today, () => 0.99).row.due_on).toBe(addDays(today, 8))
    expect(applyReview(row(1), 'good', today, () => 0).row.due_on).toBe(addDays(today, 3))
  })
})

describe('хранилище гостя', () => {
  beforeEach(() => store.clear())

  it('урок-слово пройден → слово в памяти на завтра; повторно не сбрасывается', () => {
    seedGuestWord('keep', today)
    seedGuestWord('keep', '2026-10-10')
    expect(listGuestMemory()).toEqual([{ word: 'keep', step: 1, due_on: '2026-09-26', last_card_id: null, reviews: 0, lapses: 0 }])
    expect(hasGuestMemory()).toBe(true)
  })

  it('урок модуля пройден: в память — только урок-слово между Стартом и Финалом', () => {
    const lessons = [{ id: 's', title: 'Старт' }, { id: 'a', title: 'Keep' }, { id: 'b', title: 'Таблицы' }, { id: 'f', title: 'keep' }]
    seedGuestWordOf(lessons, 's')
    seedGuestWordOf(lessons, 'f')
    seedGuestWordOf(lessons, 'b')
    expect(listGuestMemory()).toEqual([])
    seedGuestWordOf(lessons, 'a')
    expect(listGuestMemory().map(m => m.word)).toEqual(['keep'])
  })

  it('повторение: ответ как у сервера, журнал для бюджета дня, очистка после переноса', () => {
    seedGuestWord('keep', '2026-09-24')
    expect(reviewGuestWord({ word: 'нет', outcome: 'good' }, today)).toEqual({ ok: false, reason: 'not_found' })
    const res = reviewGuestWord({ word: 'keep', outcome: 'good', cardId: 'c1', events: [{ cardId: 'c1' }] }, today, mid)
    expect(res).toMatchObject({ ok: true, word: 'keep', prev_step: 1, step: 2, applied: true })
    expect(listGuestMemory()[0].last_card_id).toBe('c1')
    expect(listGuestReviews(1, localToday())).toHaveLength(1)
    clearGuestMemory()
    expect(hasGuestMemory()).toBe(false)
    expect(listGuestReviews(7, localToday())).toEqual([])
  })
})

