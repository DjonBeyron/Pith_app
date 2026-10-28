import { describe, it, expect, beforeEach } from 'vitest'

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { seedText, shouldOfferSeed, seedDayState, seedOffersToday, markSeedOffered, SEED_PER_DAY, SEED_KEY } = await import('./seedWord.js')

describe('seedText', () => {
  it('текст и подписи кнопок; слов «память» и «вкладка» нет', () => {
    const t = seedText()
    expect(t).toEqual({ title: 'Чтобы не забыть слово, сохрани его', save: 'Сохранить', decline: 'Не сейчас' })
    expect(JSON.stringify(t).toLowerCase()).not.toMatch(/памят|вкладк/)
  })
})

describe('shouldOfferSeed', () => {
  const base = { ok: true, hasDeck: true, inMemory: false, offeredToday: 0 }
  it('верный ответ, есть колода, слова нет в памяти — предлагаем', () => {
    expect(shouldOfferSeed(base)).toBe(true)
  })
  it('неверный ответ, нет колоды или уже в памяти — нет', () => {
    expect(shouldOfferSeed({ ...base, ok: false })).toBe(false)
    expect(shouldOfferSeed({ ...base, hasDeck: false })).toBe(false)
    expect(shouldOfferSeed({ ...base, inMemory: true })).toBe(false)
  })
  it('не больше 3 предложений в день', () => {
    expect(SEED_PER_DAY).toBe(3)
    expect(shouldOfferSeed({ ...base, offeredToday: 2 })).toBe(true)
    expect(shouldOfferSeed({ ...base, offeredToday: 3 })).toBe(false)
  })
})

describe('лимит дня', () => {
  beforeEach(() => store.clear())
  it('seedDayState: чужая дата и мусор обнуляют счётчик', () => {
    expect(seedDayState({ date: '2026-10-26', n: 3 }, '2026-10-27')).toEqual({ date: '2026-10-27', n: 0 })
    expect(seedDayState({ date: '2026-10-27', n: 2 }, '2026-10-27').n).toBe(2)
    expect(seedDayState('мусор', '2026-10-27').n).toBe(0)
    expect(seedDayState({ date: '2026-10-27', n: 'x' }, '2026-10-27').n).toBe(0)
  })
  it('markSeedOffered считает в localStorage, новый день — с нуля', () => {
    markSeedOffered('2026-10-27'); markSeedOffered('2026-10-27')
    expect(seedOffersToday('2026-10-27')).toBe(2)
    expect(JSON.parse(store.get(SEED_KEY))).toEqual({ date: '2026-10-27', n: 2 })
    expect(seedOffersToday('2026-10-28')).toBe(0)
  })
  it('битый JSON в хранилище — 0', () => {
    store.set(SEED_KEY, '{oops')
    expect(seedOffersToday('2026-10-27')).toBe(0)
  })
})
