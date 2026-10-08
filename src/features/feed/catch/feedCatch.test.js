import { describe, it, expect, beforeEach } from 'vitest'
import {
  wordLevel, catchWords, catchEligible, catchOwnCount, catchSignal, LEVEL_CLASS,
  canOfferCatch, shownCatchToday, markCatchShown, CATCH_PER_DAY, CATCH_GAP,
} from './feedCatch.js'

// localStorage в node-окружении vitest нет — подставляем
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const knowledge = {
  stepOf: new Map([['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['perm', 5]]),
  settledOf: new Set(['perm']),
}

describe('wordLevel', () => {
  it('нет знаний — 0', () => {
    expect(wordLevel('three', null)).toBe(0)
    expect(wordLevel('three', undefined)).toBe(0)
  })
  it('слова нет в памяти — 0', () => {
    expect(wordLevel('unknown', knowledge)).toBe(0)
  })
  it('шаги 1–2 → 1, 3–4 → 2, 5 → 3', () => {
    expect(wordLevel('one', knowledge)).toBe(1)
    expect(wordLevel('two', knowledge)).toBe(1)
    expect(wordLevel('three', knowledge)).toBe(2)
    expect(wordLevel('four', knowledge)).toBe(2)
    expect(wordLevel('five', knowledge)).toBe(3)
  })
  it('постоянная память (settledOf) → 4, важнее шага', () => {
    expect(wordLevel('perm', knowledge)).toBe(4)
  })
  it('регистр и знаки по краям не важны (wordKey)', () => {
    expect(wordLevel('Three,', knowledge)).toBe(2)
  })
})

describe('catchWords', () => {
  it('только слова, с индексом, ключом и уровнем', () => {
    const w = catchWords('Three, one: unknown!', knowledge)
    expect(w).toEqual([
      { index: 0, text: 'Three', key: 'three', level: 2 },
      { index: 1, text: 'one', key: 'one', level: 1 },
      { index: 2, text: 'unknown', key: 'unknown', level: 0 },
    ])
  })
  it('пустое название и нет знаний', () => {
    expect(catchWords('', knowledge)).toEqual([])
    expect(catchWords('three', null)[0].level).toBe(0)
  })
})

describe('catchEligible / catchOwnCount', () => {
  const words = catchWords('three one', knowledge)
  it('есть слово уровня ≥2 — можно', () => {
    expect(catchEligible(words)).toBe(true)
    expect(catchOwnCount(words)).toBe(1)
  })
  it('только слова уровня 0–1 — нельзя', () => {
    const low = catchWords('one unknown', knowledge)
    expect(catchEligible(low)).toBe(false)
    expect(catchOwnCount(low)).toBe(0)
  })
  it('выключено у модуля — нельзя', () => {
    expect(catchEligible(words, { enabled: false })).toBe(false)
  })
  it('на слайде есть «Помнишь?» — нельзя', () => {
    expect(catchEligible(words, { recallIndex: 2 })).toBe(false)
    expect(catchEligible(words, { recallIndex: 0 })).toBe(false)
    expect(catchEligible(words, { recallIndex: -1 })).toBe(true)
  })
  it('пустой список слов', () => {
    expect(catchEligible([])).toBe(false)
    expect(catchOwnCount([])).toBe(0)
  })
  it('считает все свои слова', () => {
    expect(catchOwnCount(catchWords('three four five perm one', knowledge))).toBe(4)
  })
})

describe('catchSignal', () => {
  it('чужие слова (0–1) — ничего', () => {
    expect(catchSignal(0, false)).toBe(null)
    expect(catchSignal(1, true)).toBe(null)
  })
  it('свои слова: без помощи — heard, с помощью — help', () => {
    for (const lv of [2, 3, 4]) {
      expect(catchSignal(lv, false)).toBe('heard')
      expect(catchSignal(lv, true)).toBe('help')
    }
  })
})

describe('LEVEL_CLASS', () => {
  it('классы по уровням', () => {
    expect(LEVEL_CLASS(0)).toBe('')
    expect(LEVEL_CLASS(1)).toBe('fwKnown fwKnown--1')
    expect(LEVEL_CLASS(2)).toBe('fwKnown fwKnown--2')
    expect(LEVEL_CLASS(3)).toBe('fwKnown fwKnown--3')
    expect(LEVEL_CLASS(4)).toBe('fwKnown fwKnown--P')
  })
})

describe('лимиты показа', () => {
  it('константы', () => {
    expect(CATCH_PER_DAY).toBe(3)
    expect(CATCH_GAP).toBe(5)
  })
  it('canOfferCatch: не чаще раза в 5 видео и не больше 3 в день', () => {
    expect(canOfferCatch({ swipes: 4, shown: 0 })).toBe(false)
    expect(canOfferCatch({ swipes: 5, shown: 0 })).toBe(true)
    expect(canOfferCatch({ swipes: 9, shown: 2 })).toBe(true)
    expect(canOfferCatch({ swipes: 9, shown: 3 })).toBe(false)
  })
  it('счётчик по дате: растёт за день, сбрасывается на новый', () => {
    expect(shownCatchToday('2026-10-08')).toBe(0)
    markCatchShown('2026-10-08')
    markCatchShown('2026-10-08')
    expect(shownCatchToday('2026-10-08')).toBe(2)
    expect(shownCatchToday('2026-10-09')).toBe(0)
    markCatchShown('2026-10-09')
    expect(shownCatchToday('2026-10-09')).toBe(1)
    expect(shownCatchToday('2026-10-08')).toBe(0)
  })
  it('свой ключ localStorage, не пересекается с «Помнишь?»', () => {
    markCatchShown('2026-10-08')
    expect(JSON.parse(localStorage.getItem('pithy_feed_catch_v1'))).toEqual({ date: '2026-10-08', count: 1 })
    expect(localStorage.getItem('pithy_feed_recall_v1')).toBe(null)
  })
  it('битый localStorage — 0, без падения', () => {
    localStorage.setItem('pithy_feed_catch_v1', '{не json')
    expect(shownCatchToday('2026-10-08')).toBe(0)
  })
})
