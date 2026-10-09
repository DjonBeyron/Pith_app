import { describe, it, expect } from 'vitest'
import {
  normalizeStats, rowWords, formatCount, wordsLabel, daysLabel,
  podiumPlace, isMissingFnError, isDeniedError,
} from './ratingStats.js'
import { ACHIEVEMENTS } from './achievementKinds.js'

const raw = { ok: true, words_new: 5, words_known: 3, words_solid: 2, words_perm: 10, phrases: 4, longest_streak: 12, achievements: 3 }

describe('normalizeStats', () => {
  it('ответ RPC → слова постоянной памяти, фразы, рекорд и достижения (ступени памяти не берём)', () => {
    expect(normalizeStats(raw)).toEqual({ perm: 10, phrases: 4, longestStreak: 12, achievements: 3, achievementsTotal: ACHIEVEMENTS.length })
  })
  it('сервер без поля achievements (миграция не применена) → achievements: null', () => {
    expect(normalizeStats({ ...raw, achievements: undefined }).achievements).toBeNull()
    expect(normalizeStats({ ...raw, achievements: null }).achievements).toBeNull()
    expect(normalizeStats({ ...raw, achievements: 'abc' }).achievements).toBeNull()
  })
  it('достижений не больше, чем знает клиент (как в профиле)', () => {
    expect(normalizeStats({ ...raw, achievements: 99 }).achievements).toBe(ACHIEVEMENTS.length)
    expect(normalizeStats({ ...raw, achievements: 0 }).achievements).toBe(0)
  })
  it('нет ответа / ok:false / не объект → null', () => {
    expect(normalizeStats(null)).toBeNull()
    expect(normalizeStats(undefined)).toBeNull()
    expect(normalizeStats('x')).toBeNull()
    expect(normalizeStats({ ok: false, reason: 'not_found' })).toBeNull()
    expect(normalizeStats({ words_perm: 3 })).toBeNull()
  })
  it('мусор, отрицательные и дробные числа → безопасные целые', () => {
    const s = normalizeStats({ ok: true, words_perm: 2.9, phrases: 'abc', longest_streak: -4 })
    expect(s).toMatchObject({ perm: 2, phrases: 0, longestStreak: 0, achievements: null })
  })
})

describe('rowWords', () => {
  it('words_perm строки рейтинга → целое число', () => {
    expect(rowWords({ words_perm: 120 })).toBe(120)
    expect(rowWords({ words_perm: 0 })).toBe(0)
    expect(rowWords({ words_perm: '45' })).toBe(45)
    expect(rowWords({ words_perm: -3 })).toBe(0)
  })
  it('поля нет (миграция не применена) / мусор / нет строки → null', () => {
    expect(rowWords({})).toBeNull()
    expect(rowWords({ words_perm: null })).toBeNull()
    expect(rowWords({ words_perm: 'abc' })).toBeNull()
    expect(rowWords(undefined)).toBeNull()
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
  it('склонения слов и дней', () => {
    expect([1, 2, 5, 11, 21].map(wordsLabel)).toEqual(['слово', 'слова', 'слов', 'слов', 'слово'])
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
