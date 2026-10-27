import { describe, it, expect } from 'vitest'
import { lineSchedule, defaultTotalMs } from './memoryStoryTiming.js'
import { MEMORY_STORY } from './memoryStoryText.js'

describe('lineSchedule', () => {
  it('строки идут подряд, без дыр, и укладываются в общее время', () => {
    const s = lineSchedule(['aaaa', 'bb', 'cccccc'], 12000)
    expect(s.map(x => x.at)).toEqual([0, 4000, 6000])
    expect(s.map(x => x.dur)).toEqual([4000, 2000, 6000])
    const last = s[s.length - 1]
    expect(last.at + last.dur).toBe(12000)
  })
  it('длина строки определяет её долю', () => {
    const s = lineSchedule(['x'.repeat(30), 'x'.repeat(10)], 8000)
    expect(s[0].dur).toBe(6000)
    expect(s[1].dur).toBe(2000)
  })
  it('пустая строка не ломает расписание; пустой список — пустое расписание', () => {
    expect(lineSchedule(['', 'ab'], 3000).every(x => Number.isFinite(x.at) && x.dur > 0)).toBe(true)
    expect(lineSchedule([], 5000)).toEqual([])
  })
})

describe('defaultTotalMs', () => {
  it('~70 мс на символ + 600 мс на строку', () => {
    expect(defaultTotalMs(['x'.repeat(100), 'x'.repeat(100)])).toBe(200 * 70 + 2 * 600)
  })
  it('зажато в 12–22 с', () => {
    expect(defaultTotalMs(['да'])).toBe(12000)
    expect(defaultTotalMs(['x'.repeat(2000)])).toBe(22000)
  })
  it('текст-заглушка укладывается в 15–20 с и в 5–6 коротких строк', () => {
    const total = defaultTotalMs(MEMORY_STORY.lines)
    expect(total).toBeGreaterThanOrEqual(15000)
    expect(total).toBeLessThanOrEqual(20000)
    expect(MEMORY_STORY.lines.length).toBeGreaterThanOrEqual(4)
    expect(MEMORY_STORY.lines.length).toBeLessThanOrEqual(6)
    expect(MEMORY_STORY.lines.join(' ').split(/\s+/).filter(w => /[а-яa-z]/i.test(w)).length).toBeLessThanOrEqual(50)
  })
  it('Память — с большой буквы, Пит говорит о себе в третьем лице', () => {
    const text = MEMORY_STORY.lines.join(' ')
    expect(text).toMatch(/Память/)
    expect(text).not.toMatch(/я напомню/i)
  })
})
