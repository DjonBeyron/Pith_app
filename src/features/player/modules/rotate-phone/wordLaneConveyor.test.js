import { describe, it, expect } from 'vitest'
import {
  SLOT_COUNT, LANE_X, LANE_EDGES, PILL_H, OPEN_Y, FADE_TOP, FADE_BOTTOM, ENTER_Y, EXIT_Y, SPEED, TRAVEL_MS, EXIT_TRAVEL_MS, WORD_AT, WORD_LEN, LISTEN_MS, END_TAIL_MS,
  pillYAt, spawnTime, exitTime, leadFor, pillFill, makeFillCurve, listenEnd,
} from './wordLaneTimeline.js'
import { makeListenPlan, fillsFromTimings, defaultFills } from './wordLanePlan.js'

// Конвейер диктора: постоянная скорость, слово — около центра, время слов не подвигается, картинка идёт по звуку (синхронизация)
describe('конвейер: пилюли едут постоянно с одной скоростью', () => {
  it('скорость строго постоянна: производная положения всегда SPEED, от длины слова не зависит', () => {
    for (const [at, ms] of [[2000, 400], [2000, 1000], [5000, 1800], [100, 250]]) {
      const mid = at + ms / 2
      let prev = pillYAt(0, mid)
      for (let t = 20; t <= 12000; t += 20) {
        const y = pillYAt(t, mid)
        expect(((y - prev) / 20) * 1000).toBeCloseTo(SPEED, 6)
        prev = y
      }
    }
  })

  it('слово начинается, когда пилюля ПОЛНОСТЬЮ открылась (вышла из верхнего затемнения), и от длины слова это не зависит; за слово пилюля проезжает ровно SPEED·длина', () => {
    for (const ms of [300, 800, 1000, 1600]) {
      const at = 4000
      expect(pillYAt(at, at)).toBeCloseTo(OPEN_Y, 9)
      expect(OPEN_Y - PILL_H / 2).toBeGreaterThanOrEqual(FADE_TOP)           // верхний край пилюли уже ниже затемнения
      expect(pillYAt(at + ms, at) - pillYAt(at, at)).toBeCloseTo((SPEED * ms) / 1000, 9)
    }
  })

  it('до начала слова пилюля едет из тьмы, не мгновенно: от верхнего края до полного открытия проходит секунда-другая; после слова уходит в нижнее затемнение', () => {
    expect(TRAVEL_MS).toBeGreaterThan(1000)
    expect(EXIT_TRAVEL_MS).toBeGreaterThan(2000)
    expect(FADE_BOTTOM).toBeGreaterThan(15)
    expect(100 - FADE_BOTTOM).toBeGreaterThan(OPEN_Y + PILL_H / 2)           // между затемнениями есть место, где пилюля видна целиком
  })

  it('спавн и уход считаются из той же прямой', () => {
    for (const at of [3000, 6500]) {
      expect(pillYAt(spawnTime(at), at)).toBeCloseTo(ENTER_Y, 9)
      expect(pillYAt(exitTime(at), at)).toBeCloseTo(EXIT_Y, 9)
    }
    expect(ENTER_Y + PILL_H / 2).toBeLessThan(0)    // при выкате пилюля целиком вне экрана
    expect(EXIT_Y - PILL_H / 2).toBeGreaterThan(100)
  })

  it('дорожки равные; разделители между ними', () => {
    expect(LANE_X).toHaveLength(SLOT_COUNT)
    expect(LANE_EDGES).toHaveLength(2)
    expect(LANE_X[1] - LANE_X[0]).toBeCloseTo(LANE_X[2] - LANE_X[1], 9)
  })
})

describe('расписание без озвучки автора', () => {
  it('первая пилюля выкатывается не раньше нулевой секунды, слова идут друг за другом без наложения, в одном темпе', () => {
    expect(spawnTime(WORD_AT[0])).toBeGreaterThanOrEqual(0)
    for (let k = 1; k < SLOT_COUNT; k++) expect(WORD_AT[k]).toBeGreaterThan(WORD_AT[k - 1] + WORD_LEN[k - 1])
    expect(WORD_AT[2] - WORD_AT[1]).toBeCloseTo(WORD_AT[1] - WORD_AT[0], 6)
    expect(LISTEN_MS).toBe(WORD_AT[2] + WORD_LEN[2] + END_TAIL_MS)
    expect(leadFor()).toBeCloseTo(TRAVEL_MS, 9)                  // диктор начинает, как только первая пилюля полностью открылась
    expect(WORD_AT[0] - TRAVEL_MS).toBeLessThan(150)             // и не медлит
  })
})

describe('синхронизация плана с озвучкой: время слов не подвигается', () => {
  const timings = [{ w: 'try.', t: 0.2, e: 0.7 }, { w: 'try.', t: 1.0, e: 1.6 }, { w: 'try.', t: 2.7, e: 3.5 }]

  it('слово k начинается ровно через audioAt + секунда файла × 1000 — для любых тайминга и интервалов, даже очень частых', () => {
    const cases = [
      fillsFromTimings(timings, 'try', 4),
      [{ start: 0, end: 0.3 }, { start: 0.35, end: 0.6 }, { start: 0.62, end: 0.9 }],      // слова почти встык (раньше их раздвигало — и пилюля расходилась со звуком)
      [{ start: 1.5, end: 3.2 }, { start: 3.3, end: 4.9 }, { start: 5.0, end: 6.1 }],      // длинные слова
    ]
    for (const fills of cases) {
      const p = makeListenPlan(fills)
      fills.forEach((c, k) => {
        expect(p.fillAt[k] - p.audioAt).toBe(Math.round(c.start * 1000))
        expect(p.fillMs[k]).toBe(Math.max(250, Math.round((c.end - c.start) * 1000)))
      })
    }
  })

  it('первая пилюля успевает выкатиться (spawn ≥ 0) при любом начале первого слова; слово 0 начинается, когда пилюля полностью открылась', () => {
    for (const start0 of [0, 0.1, 0.5, 1.5, 4]) {
      const fills = [{ start: start0, end: start0 + 0.6 }, { start: start0 + 1, end: start0 + 1.6 }, { start: start0 + 2, end: start0 + 2.6 }]
      const p = makeListenPlan(fills)
      expect(spawnTime(p.fillAt[0])).toBeGreaterThanOrEqual(-1)
      expect(pillYAt(p.fillAt[0], p.fillAt[0])).toBeCloseTo(OPEN_Y, 9)
      expect(p.fillAt[0] - spawnTime(p.fillAt[0])).toBeCloseTo(TRAVEL_MS, 6)
      if (start0 <= 0.5) expect(p.fillAt[0]).toBeLessThan(TRAVEL_MS + 200) // звук начинается сразу, как пилюля открыта
    }
  })

  it('картинка = звук: в момент любого мига слова в файле пилюля там, где положено, а заливка равна кривой громкости', () => {
    const wave = Array.from({ length: 160 }, (_, i) => (i % 40 < 14 ? 240 : 10))   // 4 с, пачки громкости
    const fills = [{ start: 0.4, end: 1.0 }, { start: 1.4, end: 2.2 }, { start: 2.6, end: 3.4 }]
    const p = makeListenPlan(fills, { wave, duration: 4 })
    fills.forEach((c, k) => {
      const curve = makeFillCurve(wave, 4, c.start, c.end)
      for (let s = c.start; s <= c.end + 1e-9; s += 0.05) {
        const t = p.audioAt + s * 1000                       // время фазы по звуку
        expect(pillFill(t, p.fillAt[k], p.fillMs[k], p.curves[k])).toBeCloseTo(curve((s - c.start) / (c.end - c.start)), 6)
        const y = pillYAt(t, p.fillAt[k])
        expect(y).toBeGreaterThanOrEqual(OPEN_Y - 1e-6)                                   // внутри «окна слова»: от полного открытия…
        expect(y).toBeLessThanOrEqual(OPEN_Y + (SPEED * p.fillMs[k]) / 1000 + 1e-6)       // …на SPEED·длина вниз
      }
      expect(pillFill(p.audioAt + c.start * 1000 - 1, p.fillAt[k], p.fillMs[k], p.curves[k])).toBe(0)  // до слова пустая
      expect(pillFill(p.audioAt + c.end * 1000 + 1, p.fillAt[k], p.fillMs[k], p.curves[k])).toBe(1)    // после слова полная
    })
  })

  it('пилюли разных дорожек перекрываются по времени, а друг на друга по высоте не налезают (разные дорожки)', () => {
    const p = makeListenPlan([{ start: 0, end: 0.5 }, { start: 0.2, end: 0.7 }, { start: 0.4, end: 0.9 }])
    const t = p.fillAt[1]
    const ys = [0, 1, 2].map(k => pillYAt(t, p.fillAt[k] + p.fillMs[k] / 2))
    expect(new Set(LANE_X).size).toBe(3)
    expect(ys.filter(y => y > ENTER_Y && y < EXIT_Y).length).toBeGreaterThan(1)  // одновременно на экране несколько пилюль
  })

  it('конец фазы диктора — конец последнего слова + хвост', () => {
    const p = makeListenPlan(defaultFills(6))
    expect(p.listenMs).toBe(listenEnd(p.fillAt, p.fillMs))
    expect(p.listenMs).toBe(p.fillAt[2] + p.fillMs[2] + END_TAIL_MS)
  })
})

describe('скорость голоса урока: план растягивается, а скорость конвейера остаётся одной', () => {
  const fills = [{ start: 0.2, end: 0.7 }, { start: 1.0, end: 1.5 }, { start: 1.8, end: 2.3 }]
  it('при голосе 2× слова плана вдвое короче и ближе, при 0,75× — длиннее; пилюля всё равно едет со SPEED', () => {
    const base = makeListenPlan(fills)
    for (const rate of [0.75, 1.5, 2]) {
      const p = makeListenPlan(fills, null, rate)
      expect(p.fillMs[0]).toBeCloseTo(base.fillMs[0] / rate, -1)
      expect(p.fillAt[1] - p.fillAt[0]).toBeCloseTo((base.fillAt[1] - base.fillAt[0]) / rate, -1)
      const at0 = p.fillAt[0]
      expect(pillYAt(at0 + 1000, at0) - pillYAt(at0, at0)).toBeCloseTo(SPEED, 6)
      expect(p.rate).toBe(rate)
    }
  })
  it('слово начинается при полном открытии и при другой скорости голоса', () => {
    const p = makeListenPlan(fills, null, 2)
    expect(pillYAt(p.fillAt[0], p.fillAt[0])).toBeCloseTo(OPEN_Y, 6)
  })
})
