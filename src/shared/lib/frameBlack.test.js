import { describe, it, expect } from 'vitest'
import { isBlackFrame, pickPosterTimes, frameLooksBlack } from './frameBlack.js'

// 8×8 RGBA, заполненный (r,g,b,a)
function fill(r, g, b, a = 255, n = 64) {
  const d = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a }
  return d
}

describe('isBlackFrame — чёрный кадр декодера', () => {
  it('сплошной чёрный — чёрный', () => {
    expect(isBlackFrame(fill(0, 0, 0))).toBe(true)
  })
  it('почти чёрный с лёгким шумом — чёрный', () => {
    const d = fill(2, 2, 2)
    d[0] = 9; d[1] = 9; d[2] = 9
    expect(isBlackFrame(d)).toBe(true)
  })
  it('полностью прозрачный (ничего не нарисовано / tainted) — чёрный', () => {
    expect(isBlackFrame(fill(0, 0, 0, 0))).toBe(true)
  })
  it('тёмная сцена с ярким пятном — не чёрная', () => {
    const d = fill(1, 1, 1)
    for (let i = 0; i < 4; i++) { d[i * 4] = 230; d[i * 4 + 1] = 200; d[i * 4 + 2] = 180 }
    expect(isBlackFrame(d)).toBe(false)
  })
  it('обычный светлый кадр — не чёрный', () => {
    expect(isBlackFrame(fill(120, 90, 60))).toBe(false)
  })
  it('ровный тёмно-серый выше порога — не чёрный', () => {
    expect(isBlackFrame(fill(30, 30, 30))).toBe(false)
  })
  it('нет данных — не чёрный: детектор не выбрасывает кадры вслепую', () => {
    expect(isBlackFrame(null)).toBe(false)
    expect(isBlackFrame(new Uint8ClampedArray(0))).toBe(false)
  })
})

describe('pickPosterTimes — на каких секундах пробовать кадр', () => {
  it('первым идёт запрошенное время (0 — тот кадр, с которого старт видео)', () => {
    expect(pickPosterTimes(10, 0)[0]).toBe(0)
    expect(pickPosterTimes(10, 0)).toEqual([0, 0.1, 0.3, 0.6, 5])
  })
  it('короткое видео не выходит за конец', () => {
    const t = pickPosterTimes(0.5, 0)
    expect(Math.max(...t)).toBeLessThanOrEqual(0.45)
    expect(t).toContain(0)
  })
  it('длительность неизвестна — без «середины»', () => {
    expect(pickPosterTimes(NaN, 0)).toEqual([0, 0.1, 0.3, 0.6])
  })
  it('близкие времена не повторяются', () => {
    expect(pickPosterTimes(10, 0.1)).toEqual([0.1, 0.3, 0.6, 5])
  })
  it('всегда есть хотя бы одно время', () => {
    expect(pickPosterTimes(0.01, 0).length).toBeGreaterThan(0)
  })
})

describe('frameLooksBlack — сбой чтения не считается чёрным', () => {
  it('нет document/canvas — false', () => {
    expect(frameLooksBlack({})).toBe(false)
  })
})
