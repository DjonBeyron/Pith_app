import { describe, it, expect } from 'vitest'
import {
  SLOT_COUNT, LANE_X, LANE_EDGES, PILL_H, OPEN_Y, FADE_TOP, FADE_BOTTOM, ENTER_Y, EXIT_Y, SPEED, TRAVEL_MS, EXIT_TRAVEL_MS, pillYAt, pillFill, makeFillCurve,
} from './wordLaneTimeline.js'

// Конвейер: постоянная скорость, слово начинается, когда пилюля полностью открылась
describe('конвейер: пилюли едут постоянно с одной скоростью', () => {
  it('скорость строго постоянна: производная положения всегда SPEED, от длины слова не зависит', () => {
    for (const at of [2000, 5000, 100]) {
      let prev = pillYAt(0, at)
      for (let t = 20; t <= 12000; t += 20) {
        const y = pillYAt(t, at)
        expect(((y - prev) / 20) * 1000).toBeCloseTo(SPEED, 6)
        prev = y
      }
    }
  })

  it('слово начинается, когда пилюля ПОЛНОСТЬЮ открылась (вышла из верхнего затемнения)', () => {
    expect(pillYAt(4000, 4000)).toBeCloseTo(OPEN_Y, 9)
    expect(OPEN_Y - PILL_H / 2).toBeGreaterThanOrEqual(FADE_TOP)
    expect(pillYAt(4000 + 1000, 4000) - pillYAt(4000, 4000)).toBeCloseTo(SPEED, 9)   // за секунду слова пилюля проезжает ровно SPEED
  })

  it('до начала слова пилюля едет из тьмы не мгновенно; после слова уходит в нижнее затемнение; между затемнениями есть где быть видимой целиком', () => {
    expect(TRAVEL_MS).toBeGreaterThan(1000)
    expect(EXIT_TRAVEL_MS).toBeGreaterThan(2000)
    expect(pillYAt(5000 - TRAVEL_MS, 5000)).toBeCloseTo(ENTER_Y, 9)       // выкатилась из-за верхнего края за TRAVEL_MS до слова
    expect(pillYAt(5000 + EXIT_TRAVEL_MS, 5000)).toBeCloseTo(EXIT_Y, 9)
    expect(ENTER_Y + PILL_H / 2).toBeLessThan(0)                           // при выкате пилюля целиком вне экрана
    expect(EXIT_Y - PILL_H / 2).toBeGreaterThan(100)
    expect(100 - FADE_BOTTOM).toBeGreaterThan(OPEN_Y + PILL_H / 2)
  })

  it('дорожки равные; разделители между ними', () => {
    expect(LANE_X).toHaveLength(SLOT_COUNT)
    expect(LANE_EDGES).toHaveLength(2)
    expect(LANE_X[1] - LANE_X[0]).toBeCloseTo(LANE_X[2] - LANE_X[1], 9)
  })
})

describe('заливка по громкости слова', () => {
  const wave = Array.from({ length: 160 }, (_, i) => (i % 40 < 14 ? 240 : 10))
  it('кривая: до слова 0, после 1, внутри растёт; тихая пауза почти не наливает, громкий кусок — быстро', () => {
    const curve = makeFillCurve(wave, 4, 0.4, 1.4)
    expect(pillFill(0, 1000, 1000, curve)).toBe(0)
    expect(pillFill(2100, 1000, 1000, curve)).toBe(1)
    let prev = 0
    for (let t = 1000; t <= 2000; t += 50) { const f = pillFill(t, 1000, 1000, curve); expect(f).toBeGreaterThanOrEqual(prev); prev = f }
    expect(pillFill(1500, 1000, 1000, null)).toBeCloseTo(0.5, 9)         // без кривой — линейно
  })
})
