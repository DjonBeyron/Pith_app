import { describe, it, expect } from 'vitest'
import { buildCharTimings } from './charTimings.js'

// Время появления символа с индексом i
const at = (arr, i) => arr[i]
// Монотонность: печать не может «отмотать» назад
const monotonic = arr => arr.every((t, i) => i === 0 || t >= arr[i - 1])

describe('charTimings — печать текста под звук', () => {
  it('длина массива равна длине ОРИГИНАЛЬНОГО текста', () => {
    const text = 'Привет, как дела?'
    const out  = buildCharTimings(text, [{ w: 'Привет,', t: 0 }, { w: 'как', t: 1 }, { w: 'дела?', t: 2 }])
    expect(out).toHaveLength(text.length)
    expect(monotonic(out)).toBe(true)
  })

  it('слово начинает печататься к своему таймингу (с опережением)', () => {
    const text = 'один два три'
    const out  = buildCharTimings(text, [{ w: 'один', t: 0 }, { w: 'два', t: 1 }, { w: 'три', t: 2 }])
    expect(at(out, text.indexOf('два'))).toBeCloseTo(1 - 0.08, 5)
    expect(at(out, text.indexOf('три'))).toBeCloseTo(2 - 0.08, 5)
  })

  it('двойные пробелы и переносы не сдвигают печать (главный баг)', () => {
    const timings = [{ w: 'один', t: 0 }, { w: 'два', t: 1 }, { w: 'три', t: 2 }]
    const text    = 'один  два\n\nтри'
    const out     = buildCharTimings(text, timings)
    expect(out).toHaveLength(text.length)
    // «три» стоит на 11-м символе из-за лишних разделителей — и всё равно
    // печатается ровно к своему таймингу, а не на два символа раньше
    expect(at(out, text.indexOf('три'))).toBeCloseTo(2 - 0.08, 5)
    expect(monotonic(out)).toBe(true)
  })

  it('отступ в начале текста показывается сразу, а не съедает время', () => {
    const text = '\n  привет'
    const out  = buildCharTimings(text, [{ w: 'привет', t: 1.5 }])
    expect(out.slice(0, 3)).toEqual([0, 0, 0])
    expect(at(out, text.indexOf('привет'))).toBeCloseTo(1.5 - 0.08, 5)
  })

  it('лишнее слово в таймингах не сбивает всё, что после него', () => {
    // ElevenLabs проговорил число словами, Whisper услышал вводное слово —
    // раньше сопоставление по индексу уводило весь остаток текста
    const text = 'мне двадцать лет'
    const out  = buildCharTimings(text, [
      { w: 'мне', t: 0 }, { w: 'э', t: 0.5 }, { w: 'двадцать', t: 1 }, { w: 'лет', t: 2 },
    ])
    expect(at(out, text.indexOf('двадцать'))).toBeCloseTo(1 - 0.08, 5)
    expect(at(out, text.indexOf('лет'))).toBeCloseTo(2 - 0.08, 5)
  })

  it('неопознанное слово получает время интерполяцией между соседями', () => {
    const text = 'раз плюс два'
    const out  = buildCharTimings(text, [{ w: 'раз', t: 0 }, { w: 'два', t: 2 }])
    const mid  = at(out, text.indexOf('плюс'))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(2)
    expect(monotonic(out)).toBe(true)
  })

  it('пунктуация и регистр не мешают опознать слово', () => {
    const text = 'Привет! Как дела?'
    const out  = buildCharTimings(text, [{ w: 'привет', t: 0 }, { w: 'как', t: 1 }, { w: 'дела', t: 2 }])
    expect(at(out, text.indexOf('Как'))).toBeCloseTo(1 - 0.08, 5)
    expect(at(out, text.indexOf('дела'))).toBeCloseTo(2 - 0.08, 5)
  })

  it('совсем чужие тайминги — печать раскладывается ровно, а не рывками', () => {
    const text = 'один два три'
    const out  = buildCharTimings(text, [{ w: 'qqq', t: 0 }, { w: 'www', t: 3 }])
    expect(out).toHaveLength(text.length)
    expect(monotonic(out)).toBe(true)
    expect(out[out.length - 1]).toBeGreaterThan(0)
  })

  it('без таймингов или без текста — пусто (плеер печатает по таймеру)', () => {
    expect(buildCharTimings('текст', [])).toEqual([])
    expect(buildCharTimings('', [{ w: 'a', t: 0 }])).toEqual([])
    expect(buildCharTimings('   ', [{ w: 'a', t: 0 }])).toEqual([])
  })
})
