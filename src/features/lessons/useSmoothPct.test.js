import { describe, it, expect } from 'vitest'
import { stepPct, FULL_MS } from './useSmoothPct.js'

// Сторож плавного процента карточки запуска: даже когда всё скачалось за
// один кадр, бар и цифра идут 0→100 не быстрее чем за секунду
describe('stepPct', () => {
  it('за один кадр не догоняет цель 100 — скорость ограничена', () => {
    expect(stepPct(0, 100, 16)).toBeCloseTo(1.6)
  })

  it('полная шкала 0→100 занимает ровно FULL_MS', () => {
    let shown = 0, t = 0
    while (shown < 100) { shown = stepPct(shown, 100, 16); t += 16 }
    expect(t).toBeGreaterThanOrEqual(FULL_MS)
    expect(t).toBeLessThan(FULL_MS + 32)
  })

  it('не перескакивает цель, если она ниже скорости', () => {
    expect(stepPct(40, 41, 100)).toBe(41)
  })

  it('на цели стоит на месте', () => {
    expect(stepPct(57, 57, 500)).toBe(57)
  })

  it('цель упала — сразу к ней, без отката на глазах', () => {
    expect(stepPct(80, 30, 16)).toBe(30)
  })
})

// Timestamp rAF бывает раньше момента запуска — отрицательный dt не должен
// откатывать бар назад (это и было «дёрганье» при каждом новом target)
describe('stepPct: отрицательный dt', () => {
  it('не двигает показанное назад', () => {
    expect(stepPct(40, 100, -8)).toBe(40)
  })
})
