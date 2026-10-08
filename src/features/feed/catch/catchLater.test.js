import { describe, it, expect, beforeEach } from 'vitest'
import {
  LATER_COOLDOWN_MS, LATER_STREAK_LIMIT, LATER_LONG_MS, LATER_UNTIL_KEY, LATER_STREAK_KEY,
  isLaterPaused, pruneUntil, pruneStreak, applyLater, clearStreak,
  isPhraseLaterPaused, noteLater, resetLaterStreak,
} from './catchLater.js'

const H = 60 * 60 * 1000
const T0 = 1_800_000_000_000

// localStorage в node-окружении vitest нет — подставляем
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

describe('константы', () => {
  it('3 часа / 3 подряд / 7 суток', () => {
    expect(LATER_COOLDOWN_MS).toBe(3 * H)
    expect(LATER_STREAK_LIMIT).toBe(3)
    expect(LATER_LONG_MS).toBe(7 * 24 * H)
  })
})

describe('isLaterPaused / pruneUntil', () => {
  it('пауза активна до момента, потом нет', () => {
    const m = { a: T0 + 1000 }
    expect(isLaterPaused(m, 'a', T0)).toBe(true)
    expect(isLaterPaused(m, 'a', T0 + 1000)).toBe(false)
    expect(isLaterPaused(m, 'b', T0)).toBe(false)
    expect(isLaterPaused(null, 'a', T0)).toBe(false)
  })
  it('чистка выкидывает истёкшее и мусор', () => {
    const m = { old: T0 - 1, fresh: T0 + 5, bad: 'x', nul: null }
    expect(pruneUntil(m, T0)).toEqual({ fresh: T0 + 5 })
    expect(pruneUntil([1, 2], T0)).toEqual({})
    expect(pruneUntil(undefined, T0)).toEqual({})
  })
  it('записей не больше 100 — остаются самые поздние', () => {
    const m = {}
    for (let i = 0; i < 130; i++) m[`k${i}`] = T0 + 1 + i
    const out = pruneUntil(m, T0)
    expect(Object.keys(out)).toHaveLength(100)
    expect(out.k129).toBe(T0 + 130)
    expect(out.k0).toBeUndefined()
  })
})

describe('pruneStreak', () => {
  it('устаревшие (старше 7 суток) и битые убираются', () => {
    const m = { ok: { n: 2, at: T0 - H }, old: { n: 2, at: T0 - LATER_LONG_MS - 1 }, bad: { n: 0, at: T0 }, str: 5 }
    expect(pruneStreak(m, T0)).toEqual({ ok: { n: 2, at: T0 - H } })
  })
})

describe('applyLater', () => {
  it('первое «позже»: пауза 3 часа, счёт 1, не длинная', () => {
    const r = applyLater({}, {}, 'p', T0)
    expect(r).toMatchObject({ n: 1, long: false, pausedUntil: T0 + 3 * H })
    expect(r.until).toEqual({ p: T0 + 3 * H })
    expect(r.streak).toEqual({ p: { n: 1, at: T0 } })
  })
  it('третье подряд: пауза 7 суток, счёт сброшен', () => {
    let st = { until: {}, streak: {} }
    st = { ...st, ...applyLater(st.until, st.streak, 'p', T0) }
    st = { ...st, ...applyLater(st.until, st.streak, 'p', T0 + 4 * H) }
    expect(st.n).toBe(2)
    expect(st.long).toBe(false)
    const r = applyLater(st.until, st.streak, 'p', T0 + 8 * H)
    expect(r).toMatchObject({ n: 3, long: true, pausedUntil: T0 + 8 * H + LATER_LONG_MS })
    expect(r.until.p).toBe(T0 + 8 * H + LATER_LONG_MS)
    expect(r.streak.p).toBeUndefined()
    // после длинной паузы счёт снова с единицы
    expect(applyLater(r.until, r.streak, 'p', T0 + 8 * H + LATER_LONG_MS + 1).n).toBe(1)
  })
  it('разные фразы считаются отдельно', () => {
    const a = applyLater({}, {}, 'a', T0)
    const b = applyLater(a.until, a.streak, 'b', T0 + 1)
    expect(b.n).toBe(1)
    expect(b.until).toEqual({ a: T0 + 3 * H, b: T0 + 1 + 3 * H })
  })
  it('устаревший счёт (>7 суток) не копится', () => {
    const streak = { p: { n: 2, at: T0 - LATER_LONG_MS - 1 } }
    expect(applyLater({}, streak, 'p', T0)).toMatchObject({ n: 1, long: false })
  })
  it('не мутирует входные карты', () => {
    const until = { x: T0 + 10 }
    const streak = { p: { n: 1, at: T0 } }
    applyLater(until, streak, 'p', T0 + 1)
    expect(until).toEqual({ x: T0 + 10 })
    expect(streak).toEqual({ p: { n: 1, at: T0 } })
  })
})

describe('clearStreak', () => {
  it('убирает запись фразы, остальное не трогает', () => {
    const m = { a: { n: 1, at: 1 }, b: { n: 2, at: 2 } }
    expect(clearStreak(m, 'a')).toEqual({ b: { n: 2, at: 2 } })
    expect(m.a).toBeDefined()
  })
  it('нет записи — возвращает ту же карту', () => {
    const m = { a: { n: 1, at: 1 } }
    expect(clearStreak(m, 'zzz')).toBe(m)
  })
})

describe('обёртки localStorage', () => {
  it('noteLater пишет оба ключа, isPhraseLaterPaused видит паузу', () => {
    const r = noteLater('p', T0)
    expect(r).toEqual({ n: 1, long: false, pausedUntil: T0 + 3 * H })
    expect(JSON.parse(localStorage.getItem(LATER_UNTIL_KEY))).toEqual({ p: T0 + 3 * H })
    expect(JSON.parse(localStorage.getItem(LATER_STREAK_KEY))).toEqual({ p: { n: 1, at: T0 } })
    expect(isPhraseLaterPaused('p', T0 + 3 * H - 1)).toBe(true)
    expect(isPhraseLaterPaused('p', T0 + 3 * H)).toBe(false)
    expect(isPhraseLaterPaused('other', T0)).toBe(false)
  })
  it('три «позже» подряд — 7 суток; «Проверить» между ними обнуляет счёт', () => {
    noteLater('p', T0)
    noteLater('p', T0 + 4 * H)
    resetLaterStreak('p')
    expect(noteLater('p', T0 + 8 * H).n).toBe(1)
    noteLater('p', T0 + 12 * H)
    const r = noteLater('p', T0 + 16 * H)
    expect(r.long).toBe(true)
    expect(isPhraseLaterPaused('p', T0 + 16 * H + 6 * 24 * H)).toBe(true)
    expect(isPhraseLaterPaused('p', T0 + 16 * H + LATER_LONG_MS)).toBe(false)
  })
  it('resetLaterStreak без записи ничего не пишет', () => {
    resetLaterStreak('p')
    expect(localStorage.getItem(LATER_STREAK_KEY)).toBe(null)
  })
  it('localStorage недоступен или битый — не падаем, пауза не стоит', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(isPhraseLaterPaused('p', T0)).toBe(false)
    expect(() => noteLater('p', T0)).not.toThrow()
    expect(() => resetLaterStreak('p')).not.toThrow()
    globalThis.localStorage = { getItem: () => '{oops', setItem: () => {} }
    expect(isPhraseLaterPaused('p', T0)).toBe(false)
    globalThis.localStorage = { getItem: () => '[1,2]', setItem: () => {} }
    expect(isPhraseLaterPaused('p', T0)).toBe(false)
  })
})
