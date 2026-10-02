import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { localDate, cardsShownToday } = await import('./dailyPick.js')
const {
  seedGuestWord, reviewGuestWord, listGuestMemory, listGuestReviews, clearGuestMemory,
  debugShiftGuest, debugTodayGuest, debugAddGuest, debugRemoveGuest, debugStepGuest,
} = await import('./guestMemory.js')

const today = localDate(new Date())
const mem = word => listGuestMemory().find(m => m.word === word)
const put = (word, step, due_on) => localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({
  ...JSON.parse(localStorage.getItem('pithy_guest_memory_v1') ?? '{}'),
  [word]: { word, step, due_on, last_card_id: null, reviews: 0, lapses: 0 },
}))

beforeEach(() => { store.clear(); clearGuestMemory() })

// Тест-инструменты админа в режиме «новенький» — те же действия, что серверные memory_debug_*
describe('песочница админа: прожить день, к повтору сегодня, шаги слова', () => {
  it('«прожить день»: сроки слов и журнал сдвигаются — бюджет карточек дня освобождается', () => {
    put('trying', 3, localDate(new Date(Date.now() + 86400000))) // срок завтра
    seedGuestWord('cook', today)
    reviewGuestWord({ word: 'cook', outcome: 'good', cardId: 'c1', events: [{ cardId: 'c1' }] }, today)
    expect(cardsShownToday(listGuestReviews(7, today), today)).toBe(1)
    expect(debugShiftGuest(1)).toBe(2)
    expect(mem('trying').due_on).toBe(today) // завтра → сегодня
    expect(cardsShownToday(listGuestReviews(7, today), today)).toBe(0) // журнал — «вчера»
  })

  it('«к повтору сегодня»: срок наступает, у уже наступивших не меняется; журнал последних 36 часов уходит из «сегодня»', () => {
    put('trying', 3, '2999-01-01')
    put('cook', 2, '2000-01-01')
    seedGuestWord('keep', today)
    reviewGuestWord({ word: 'keep', outcome: 'good', cardId: 'k1', events: [{ cardId: 'k1' }] }, today)
    const r = debugTodayGuest(['trying'], today)
    expect(r).toMatchObject({ ok: true, words: 1, journal: 1 })
    expect(mem('trying').due_on).toBe(today)
    expect(mem('cook').due_on).toBe('2000-01-01') // не тронут (и срок давно наступил)
    expect(cardsShownToday(listGuestReviews(7, today), today)).toBe(0)
  })

  it('«к повтору сегодня» без списка — все слова', () => {
    put('a', 1, '2999-01-01'); put('b', 4, '2999-02-02')
    expect(debugTodayGuest(null, today).words).toBe(2)
    expect(mem('a').due_on).toBe(today)
    expect(mem('b').due_on).toBe(today)
  })

  it('добавить и убрать слово', () => {
    expect(debugAddGuest('plan', today)).toMatchObject({ ok: true, step: 1, due_on: today })
    expect(mem('plan').due_on).toBe(today)
    put('plan', 4, '2999-01-01')
    expect(debugAddGuest('plan', today)).toMatchObject({ step: 4, due_on: today }) // шаг тот же, срок на сегодня
    expect(debugRemoveGuest('plan')).toBe(1)
    expect(debugRemoveGuest('plan')).toBe(0)
    expect(debugAddGuest('', today).ok).toBe(false)
  })

  it('«Повторил → шаг»: +1 по интервалу шага, на шаге 5 — постоянная память, дальше некуда', () => {
    put('hold', 1, today)
    expect(debugStepGuest('hold', 'next', today)).toMatchObject({ ok: true, prev_step: 1, step: 2, settled: false, end: false })
    expect(mem('hold').due_on).toBe(localDate(new Date(Date.now() + 3 * 86400000))) // интервал шага 2 — 3 дня
    put('hold', 5, today)
    expect(debugStepGuest('hold', 'next', today)).toMatchObject({ step: 5, settled: true })
    expect(mem('hold').settled_on).toBe(today)
    expect(debugStepGuest('hold', 'next', today)).toMatchObject({ end: true })
  })

  it('«Сбросить слово»: как новое, постоянная снимается, срок — СЕГОДНЯ', () => {
    put('hold', 5, '2999-01-01')
    localStorage.setItem('pithy_guest_memory_v1', JSON.stringify({ hold: { word: 'hold', step: 5, due_on: '2999-01-01', settled_on: today, reviews: 4, lapses: 1 } }))
    expect(debugStepGuest('hold', 'reset', today)).toMatchObject({ ok: true, prev_step: 5, step: 1, due_on: today })
    expect(mem('hold')).toMatchObject({ step: 1, due_on: today, settled_on: null, reviews: 0, lapses: 0 })
  })

  it('нет слова или неизвестное действие — отказ', () => {
    expect(debugStepGuest('nope', 'next', today)).toMatchObject({ ok: false, reason: 'not_found' })
    put('hold', 1, today)
    expect(debugStepGuest('hold', 'fly', today)).toMatchObject({ ok: false, reason: 'action' })
  })
})
