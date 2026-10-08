import { describe, it, expect } from 'vitest'
import {
  normalizeStats, stepBars, formatCount, wordsLabel, phrasesLabel, daysLabel,
  podiumPlace, isMissingFnError, isDeniedError, STEPS,
} from './ratingStats.js'

const raw = { ok: true, words_new: 5, words_known: 3, words_solid: 2, words_perm: 10, phrases: 4, longest_streak: 12 }

describe('normalizeStats', () => {
  it('ответ RPC → счётчики и общее число слов в памяти', () => {
    expect(normalizeStats(raw)).toEqual({ new: 5, known: 3, solid: 2, perm: 10, total: 20, phrases: 4, longestStreak: 12 })
  })
  it('нет ответа / ok:false / не объект → null', () => {
    expect(normalizeStats(null)).toBeNull()
    expect(normalizeStats(undefined)).toBeNull()
    expect(normalizeStats('x')).toBeNull()
    expect(normalizeStats({ ok: false, reason: 'not_found' })).toBeNull()
    expect(normalizeStats({ words_perm: 3 })).toBeNull()
  })
  it('мусор, отрицательные и дробные числа → безопасные целые', () => {
    const s = normalizeStats({ ok: true, words_new: '7', words_known: -3, words_solid: null, words_perm: 2.9, phrases: 'abc' })
    expect(s).toEqual({ new: 7, known: 0, solid: 0, perm: 2, total: 9, phrases: 0, longestStreak: 0 })
  })
})

describe('stepBars', () => {
  it('четыре ступени в порядке Новые → Постоянная, доли от всех слов', () => {
    const bars = stepBars(normalizeStats(raw))
    expect(bars.map(b => b.key)).toEqual(['new', 'known', 'solid', 'perm'])
    expect(bars.map(b => b.count)).toEqual([5, 3, 2, 10])
    expect(bars[3].share).toBeCloseTo(0.5)
    expect(bars[0].color).toBe('#b6fe3b')
    expect(bars[3].color).toBe('#a78bfa')
  })
  it('пустая ступень — 0, маленькая — не тоньше 6%', () => {
    const bars = stepBars(normalizeStats({ ok: true, words_new: 1, words_perm: 999 }))
    expect(bars[1].share).toBe(0)
    expect(bars[0].share).toBe(0.06)
  })
  it('без данных — нулевые полосы, не падает', () => {
    expect(stepBars(null).every(b => b.share === 0 && b.count === 0)).toBe(true)
    expect(stepBars(null)).toHaveLength(STEPS.length)
  })
})

describe('подписи', () => {
  it('formatCount: тысячи через неразрывный пробел', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(12345)).toBe('12 345')
    expect(formatCount(1234567)).toBe('1 234 567')
    expect(formatCount(-1500)).toBe('−1 500')
    expect(formatCount('abc')).toBe('0')
    expect(formatCount(undefined)).toBe('0')
  })
  it('склонения слов, фраз и дней', () => {
    expect([1, 2, 5, 11, 21].map(wordsLabel)).toEqual(['слово', 'слова', 'слов', 'слов', 'слово'])
    expect([0, 1, 3, 12, 22].map(phrasesLabel)).toEqual(['фраз', 'фраза', 'фразы', 'фраз', 'фразы'])
    expect([1, 4, 7, 14].map(daysLabel)).toEqual(['день', 'дня', 'дней', 'дней'])
  })
  it('podiumPlace: только 1–3', () => {
    expect([0, 1, 3, 4, 50].map(podiumPlace)).toEqual([null, 1, 3, null, null])
  })
})

describe('классификация ошибок RPC', () => {
  it('функции нет (миграция не применена)', () => {
    expect(isMissingFnError({ code: 'PGRST202', message: 'x' })).toBe(true)
    expect(isMissingFnError({ code: '42883', message: 'x' })).toBe(true)
    expect(isMissingFnError({ message: 'Could not find the function public.leaderboard_user_stats(p_user)' })).toBe(true)
    expect(isMissingFnError({ code: '500', message: 'timeout' })).toBe(false)
    expect(isMissingFnError(null)).toBe(false)
  })
  it('нет прав (гость)', () => {
    expect(isDeniedError({ code: '42501', message: 'x' })).toBe(true)
    expect(isDeniedError({ status: 403, message: 'x' })).toBe(true)
    expect(isDeniedError({ message: 'permission denied for function' })).toBe(true)
    expect(isDeniedError({ code: 'PGRST202', message: 'x' })).toBe(false)
    expect(isDeniedError(undefined)).toBe(false)
  })
})
