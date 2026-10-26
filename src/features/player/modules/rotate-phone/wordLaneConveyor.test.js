import { describe, it, expect } from 'vitest'
import {
  SLOT_COUNT, LANE_X, LANE_EDGES, PILL_H, ZONE_Y, ENTER_Y, EXIT_Y, SPEED, TRAVEL_MS, EXIT_TRAVEL_MS, WORD_AT, WORD_LEN, LISTEN_MS, END_TAIL_MS,
  pillYAt, spawnTime, exitTime, leadFor, pillFill, makeFillCurve, listenEnd,
} from './wordLaneTimeline.js'
import { makeListenPlan, fillsFromTimings, defaultFills } from './wordLanePlan.js'
import { syncClock, audioPlayingMs, MAX_UP, MAX_DOWN, HOLD_MAX_MS } from './wordLaneClock.js'

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

describe('часы: картинка идёт по звуку, а не по таймеру', () => {
  const run = (tick, { audioStartMs, rate = 1, audioAt = 1300, frames = 400, dt = 16 }) => {
    // tick(frame) → {tTimer, audioMs}; симулируем кадры и возвращаем [{t, drift, tTimer, audioT}]
    let drift = 0
    let prev = null
    const out = []
    for (let f = 1; f <= frames; f++) {
      const tTimer = f * dt
      const playing = tTimer >= audioStartMs
      const audioMs = playing ? (tTimer - audioStartMs) * rate : null
      const c = syncClock({ tTimer, audioMs, audioAt, drift, prev, dt })
      drift = c.drift; prev = c.prev
      out.push({ t: c.t, tTimer, audioT: playing ? audioAt + audioMs : null })
    }
    return out
  }

  it('звук включился с опозданием 300 мс (декодирование на телефоне): картинка плавно подстраивается и сходится к звуку', () => {
    const frames = run(null, { audioStartMs: 1300 + 300 })
    const last = frames.at(-1)
    expect(Math.abs(last.t - last.audioT)).toBeLessThan(15)
  })

  it('время для картинки никогда не идёт назад и не скачет: в каждом кадре шаг ≥ 0 и не больше ~2× реального', () => {
    for (const late of [0, 150, 400, 900]) {
      const frames = run(null, { audioStartMs: 1300 + late, frames: 600 })
      for (let i = 1; i < frames.length; i++) {
        const step = frames[i].t - frames[i - 1].t
        expect(step).toBeGreaterThanOrEqual(16 * (1 - MAX_DOWN) - 1e-9)
        expect(step).toBeLessThanOrEqual(16 * (1 + MAX_UP) + 1e-9)
      }
    }
  })

  it('скорость голоса урока 2× и 0,75× не рассинхронизирует: время слов в секундах файла, картинка берёт его с currentTime', () => {
    for (const rate of [0.75, 1.5, 2]) {
      const frames = run(null, { audioStartMs: 1300, rate, frames: 500 })
      const last = frames.at(-1)
      expect(Math.abs(last.t - last.audioT)).toBeLessThan(20)
    }
  })

  it('пока звука нет (до старта и после конца файла) время идёт по таймеру с накопленной поправкой, без скачка', () => {
    let c = { drift: 0, prev: null }
    for (let f = 1; f <= 100; f++) c = syncClock({ tTimer: f * 16, audioMs: (f * 16) + 50, audioAt: 1300, drift: c.drift, prev: c.prev, dt: 16 })
    const before = syncClock({ tTimer: 1600, audioMs: 300, audioAt: 1300, drift: c.drift, prev: c.prev, dt: 16 })
    const after = syncClock({ tTimer: 1616, audioMs: null, audioAt: 1300, drift: before.drift, prev: before.prev, dt: 16 })
    expect(after.t - before.t).toBeCloseTo(16, 6)
  })

  it('audioPlayingMs: пауза, конец и «время ещё не пошло» — не звук; идущий файл — его currentTime в мс', () => {
    expect(audioPlayingMs(null)).toBeNull()
    expect(audioPlayingMs({ paused: true, ended: false, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: true, currentTime: 2 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 0 })).toBeNull()
    expect(audioPlayingMs({ paused: false, ended: false, currentTime: 1.25 })).toBe(1250)
  })

  it('звук опаздывает (декодирование): картинка ЖДЁТ его на audioAt и не убегает вперёд, поэтому откатывать назад нечего — после старта звука ошибка сразу ≈ 0', () => {
    for (const late of [100, 400, 900, 1400]) {
      const audioAt = 1300
      let c = { drift: 0, prev: null }
      let maxT = 0, errAfter = 0
      for (let f = 1; f <= 400; f++) {
        const tTimer = f * 16
        const playing = tTimer >= audioAt + late
        const audioMs = playing ? tTimer - (audioAt + late) : null
        const wait = !playing
        c = syncClock({ tTimer, audioMs, audioAt, drift: c.drift, prev: c.prev, dt: 16, wait })
        if (!playing) maxT = Math.max(maxT, c.t)
        else errAfter = Math.max(errAfter, Math.abs(c.t - (audioAt + audioMs)))
      }
      expect(maxT).toBeLessThanOrEqual(audioAt + 1e-9)          // до звука время не уходит за audioAt
      expect(errAfter).toBeLessThan(20)                          // после старта картинка = звуку без догонялок
    }
  })

  it('звук так и не пошёл (заблокирован, не загрузился): через HOLD_MAX_MS картинка отпускается и идёт по таймеру', () => {
    let c = { drift: 0, prev: null }
    let prevT = 0, maxStep = 0, held = 0
    for (let f = 1; f <= 400; f++) {
      c = syncClock({ tTimer: f * 16, audioMs: null, audioAt: 1300, drift: c.drift, prev: c.prev, dt: 16, wait: true })
      if (c.t === 1300) held++
      else if (prevT > 1300) maxStep = Math.max(maxStep, Math.abs(c.t - prevT - 16))
      prevT = c.t
    }
    expect(held * 16).toBeGreaterThanOrEqual(HOLD_MAX_MS - 100)  // сначала картинка ждёт звук на audioAt
    expect(maxStep).toBeLessThan(1e-6)                           // потом идёт дальше с обычной скоростью, без скачка (кроме самой остановки)
    expect(prevT).toBeGreaterThan(1300 + 2000)                   // и не застряла
  })
})
