import { describe, it, expect } from 'vitest'
import {
  SLOT_COUNT, LANE_X, LANE_EDGES, PILL_H, ZONE_Y, ENTER_Y, EXIT_Y, SPEED, TRAVEL_MS, EXIT_TRAVEL_MS, WORD_AT, WORD_LEN, LISTEN_MS, END_TAIL_MS,
  pillYAt, spawnTime, exitTime, leadFor, pillFill, makeFillCurve, listenEnd,
} from './wordLaneTimeline.js'
import { makeListenPlan, fillsFromTimings, defaultFills } from './wordLanePlan.js'
import { syncClock, audioPlayingMs, MAX_RATE } from './wordLaneClock.js'

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

  it('середина слова — ровно в центре экрана; начало слова выше центра, конец ниже, симметрично', () => {
    for (const ms of [300, 800, 1000, 1600]) {
      const at = 4000
      expect(pillYAt(at + ms / 2, at + ms / 2)).toBeCloseTo(ZONE_Y, 9)
      const yStart = pillYAt(at, at + ms / 2)
      const yEnd = pillYAt(at + ms, at + ms / 2)
      expect(ZONE_Y - yStart).toBeCloseTo(yEnd - ZONE_Y, 9)
      expect(yEnd - yStart).toBeCloseTo((SPEED * ms) / 1000, 9)  // за слово пилюля проезжает ровно SPEED·длина
    }
  })

  it('слово звучит «примерно в центре»: для обычных слов (0,3–1,6 с) оно целиком в средней части экрана, не прилетает сразу в центр и не уходит с экрана', () => {
    for (const ms of [300, 1000, 1600]) {
      const yStart = pillYAt(5000, 5000 + ms / 2)
      const yEnd = pillYAt(5000 + ms, 5000 + ms / 2)
      expect(yStart).toBeGreaterThan(5)
      expect(yEnd).toBeLessThan(92)
      expect(yStart).toBeLessThan(ZONE_Y)
      expect(yEnd).toBeGreaterThan(ZONE_Y)
    }
    // выкатилась заранее и ехала до слова не «мгновенно»: путь от верхнего края до центра занимает секунды
    expect(TRAVEL_MS).toBeGreaterThan(2000)
    expect(EXIT_TRAVEL_MS).toBeGreaterThan(2000)
  })

  it('спавн и уход считаются из той же прямой', () => {
    for (const [at, ms] of [[3000, 1000], [6500, 700]]) {
      expect(pillYAt(spawnTime(at, ms), at + ms / 2)).toBeCloseTo(ENTER_Y, 9)
      expect(pillYAt(exitTime(at, ms), at + ms / 2)).toBeCloseTo(EXIT_Y, 9)
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
    expect(spawnTime(WORD_AT[0], WORD_LEN[0])).toBeGreaterThanOrEqual(-1)
    for (let k = 1; k < SLOT_COUNT; k++) expect(WORD_AT[k]).toBeGreaterThan(WORD_AT[k - 1] + WORD_LEN[k - 1])
    expect(WORD_AT[2] - WORD_AT[1]).toBe(WORD_AT[1] - WORD_AT[0])
    expect(LISTEN_MS).toBe(WORD_AT[2] + WORD_LEN[2] + END_TAIL_MS)
    expect(leadFor(1000)).toBeCloseTo(TRAVEL_MS - 500, 9)
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

  it('первая пилюля успевает выкатиться (spawn ≥ 0) при любом начале первого слова; слово 0 приходится на центр экрана', () => {
    for (const start0 of [0, 0.1, 0.5, 1.5, 4]) {
      const fills = [{ start: start0, end: start0 + 0.6 }, { start: start0 + 1, end: start0 + 1.6 }, { start: start0 + 2, end: start0 + 2.6 }]
      const p = makeListenPlan(fills)
      expect(spawnTime(p.fillAt[0], p.fillMs[0])).toBeGreaterThanOrEqual(-1)
      expect(pillYAt(p.fillAt[0] + p.fillMs[0] / 2, p.fillAt[0] + p.fillMs[0] / 2)).toBeCloseTo(ZONE_Y, 9)
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
        const y = pillYAt(t, p.fillAt[k] + p.fillMs[k] / 2)
        expect(y).toBeGreaterThanOrEqual(ZONE_Y - (SPEED * p.fillMs[k]) / 2000 - 1e-6)   // внутри «окна слова» вокруг центра
        expect(y).toBeLessThanOrEqual(ZONE_Y + (SPEED * p.fillMs[k]) / 2000 + 1e-6)
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

describe('часы: картинка течёт ровно и подстраивается под звук плавно', () => {
  // Симуляция кадров: звук стартует в audioStartMs (по таймеру), его currentTime можно «огрублять» (шаг step, как на телефоне) и шуметь
  const run = ({ audioStartMs, audioAt = 1300, frames = 700, dt = 16, step = 0, noise = 0, seed = 1 }) => {
    let rnd = seed
    const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647 - 0.5 }
    let drift = 0
    const out = []
    for (let f = 1; f <= frames; f++) {
      const tTimer = f * dt
      const playing = tTimer >= audioStartMs
      let audioMs = playing ? tTimer - audioStartMs + rand() * noise : null
      if (audioMs != null && step) audioMs = Math.floor(audioMs / step) * step
      if (audioMs != null && audioMs <= 0) audioMs = null
      const c = syncClock({ tTimer, audioMs, audioAt, drift, dt })
      drift = c.drift
      out.push({ t: c.t, audioT: playing ? audioAt + tTimer - audioStartMs : null })
    }
    return out
  }
  const steps = frames => frames.slice(1).map((r, i) => r.t - frames[i].t)

  it('звук включился с опозданием 300 мс (декодирование на телефоне): картинка плавно подстраивается и сходится к звуку', () => {
    const frames = run({ audioStartMs: 1300 + 300, frames: 900 })
    const last = frames.at(-1)
    expect(Math.abs(last.t - last.audioT)).toBeLessThan(15)
  })

  it('картинка НИКОГДА не втыкается и не прыгает: шаг каждого кадра в пределах ±MAX_RATE от обычного — даже при опоздании звука, грубом currentTime (шаг 100 мс) и шуме', () => {
    for (const late of [0, 80, 150, 400, 900]) {
      for (const [step, noise] of [[0, 0], [100, 0], [250, 0], [0, 60], [50, 40]]) {
        const frames = run({ audioStartMs: 1300 + late, frames: 700, step, noise })
        for (const d of steps(frames)) {
          expect(d).toBeGreaterThanOrEqual(16 * (1 - MAX_RATE) - 1e-9)
          expect(d).toBeLessThanOrEqual(16 * (1 + MAX_RATE) + 1e-9)
        }
      }
    }
  })

  it('на грубом currentTime (шаг 100 мс) картинка держится около звука: средняя ошибка в пределах шага', () => {
    const frames = run({ audioStartMs: 1300, frames: 900, step: 100 }).filter(r => r.audioT != null).slice(100)
    const mean = frames.reduce((a, r) => a + Math.abs(r.t - r.audioT), 0) / frames.length
    expect(mean).toBeLessThan(100)
  })

  it('пока звука нет (до старта и после конца файла) поправка не меняется и время идёт по таймеру, без скачка', () => {
    let c = { drift: 0 }
    for (let f = 1; f <= 100; f++) c = syncClock({ tTimer: f * 16, audioMs: f * 16 + 50, audioAt: 1300, drift: c.drift, dt: 16 })
    const before = syncClock({ tTimer: 1600, audioMs: 300, audioAt: 1300, drift: c.drift, dt: 16 })
    const after = syncClock({ tTimer: 1616, audioMs: null, audioAt: 1300, drift: before.drift, dt: 16 })
    expect(after.t - before.t).toBeCloseTo(16, 6)
  })

  it('audioPlayingMs: пауза, конец и «время ещё не пошло» — не звук; идущий файл — его currentTime в мс', () => {
    expect(audioPlayingMs(null)).toBeNull()
    expect(audioPlayingMs({ paused: true, ended: false, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: true, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 0 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 1.25 })).toBe(1250)
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
      const mid = p.fillAt[0] + p.fillMs[0] / 2
      expect(((pillYAt(mid + 1000, mid) - pillYAt(mid, mid)))).toBeCloseTo(SPEED, 6)
      expect(p.rate).toBe(rate)
    }
  })
  it('слово у центра экрана и при другой скорости голоса', () => {
    const p = makeListenPlan(fills, null, 2)
    expect(pillYAt(p.fillAt[0] + p.fillMs[0] / 2, p.fillAt[0] + p.fillMs[0] / 2)).toBeCloseTo(ZONE_Y, 6)
  })
})
