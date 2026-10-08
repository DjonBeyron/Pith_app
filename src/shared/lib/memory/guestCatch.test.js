import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { localDate } = await import('./dailyPick.js')
const { seedGuestWord, listGuestMemory, listGuestReviews, debugAddGuest } = await import('./guestMemory.js')
const { catchGuestHeard, catchGuestHelp, guestCatchCounts } = await import('./guestCatch.js')

const today = '2026-10-08'
const localToday = () => localDate(new Date())

describe('ловля слов в ленте — память гостя', () => {
  beforeEach(() => store.clear())

  it('слова нет в памяти → not_found, журнал пуст', () => {
    expect(catchGuestHeard('keep', 'm1', today)).toEqual({ ok: false, reason: 'not_found' })
    expect(catchGuestHelp('keep', 'm1', today)).toEqual({ ok: false, reason: 'not_found' })
    expect(listGuestReviews(1, localToday())).toEqual([])
  })

  it('услышано: шаг и срок не меняются, журнал good/applied=false, heard растёт', () => {
    seedGuestWord('keep', '2026-10-01')
    const before = listGuestMemory()[0]
    expect(catchGuestHeard('keep', 'm1', today)).toEqual({ ok: true, word: 'keep', heard: 1 })
    expect(catchGuestHeard('keep', 'm2', today)).toEqual({ ok: true, word: 'keep', heard: 2 })
    expect(listGuestMemory()[0]).toEqual(before)
    const log = listGuestReviews(1, localToday())
    expect(log).toHaveLength(2)
    expect(log[0]).toMatchObject({
      word: 'keep', outcome: 'good', source: 'feed_catch', step_before: 1, step_after: 1,
      applied: false, events: { module: 'm1' },
    })
    expect(guestCatchCounts()).toEqual(new Map([['keep', 2]]))
  })

  it('помочь памяти: срок на завтра (не позже), шаг тот же, журнал hard/applied=true', () => {
    seedGuestWord('keep', '2026-10-01') // срок 2026-10-02 — уже ближе завтрашнего
    debugAddGuest('far', '2026-10-01')
    const mem = Object.fromEntries(listGuestMemory().map(m => [m.word, m]))
    expect(mem.far.due_on).toBe('2026-10-01')
    // далёкий срок — подтягивается к завтра
    store.set('pithy_guest_memory_v1', JSON.stringify({ ...mem, far: { ...mem.far, step: 4, due_on: '2026-11-20' } }))
    expect(catchGuestHelp('far', 'm1', today)).toEqual({ ok: true, word: 'far', due_on: '2026-10-09' })
    // ближний срок — остаётся
    expect(catchGuestHelp('keep', 'm1', today)).toEqual({ ok: true, word: 'keep', due_on: '2026-10-02' })
    const after = Object.fromEntries(listGuestMemory().map(m => [m.word, m]))
    expect(after.far).toMatchObject({ step: 4, due_on: '2026-10-09' })
    expect(after.keep).toMatchObject({ step: 1, due_on: '2026-10-02' })
    const log = listGuestReviews(1, localToday())
    expect(log).toHaveLength(2)
    expect(log[0]).toMatchObject({ word: 'far', outcome: 'hard', source: 'feed_catch', step_before: 4, step_after: 4, applied: true })
    // «помочь» в счётчик «услышано» не идёт
    expect(guestCatchCounts()).toEqual(new Map())
  })
})
