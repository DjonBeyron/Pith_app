import { describe, it, expect, beforeEach } from 'vitest'
import {
  publishLevel, unpublishLevel, subscribeAudioLevel, hasPlayingSources,
  levelFromWave, speechEnvelope, synthBands, BAND_PROFILES, MIN_LEVEL, MIN_LEVEL_OFF, BAND_FLOOR, _audioLevelTestHooks,
} from './audioLevel.js'

// Ручной rAF: кадры прокручиваем сами, с заданным временем
let queue = []
let hidden = false
const hooks = _audioLevelTestHooks({
  raf: cb => { queue.push(cb); return queue.length },
  caf: () => { queue = [] },
  hidden: () => hidden,
})
function frame(now) {
  const cbs = queue; queue = []
  cbs.forEach(cb => cb(now))
}

beforeEach(() => { hooks.reset(); queue = []; hidden = false })

describe('audioLevel: цикл и источники', () => {
  it('без источников цикл не запускается, подписчик молчит', () => {
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    expect(hooks.isRunning()).toBe(false)
    expect(queue.length).toBe(0)
    expect(got).toEqual([])
  })

  it('источник + подписчик → цикл идёт, уровень — максимум по источникам', () => {
    const got = []
    subscribeAudioLevel((l, a) => got.push([+l.toFixed(3), a]))
    publishLevel('a', { playing: true, getLevel: () => 0.2 })
    publishLevel('b', { playing: true, getLevel: () => 0.8 })
    expect(hooks.isRunning()).toBe(true)
    frame(0)
    // Атака 0.6 от нуля к 0.8
    expect(got.at(-1)).toEqual([0.48, true])
    frame(40)
    expect(got.at(-1)[0]).toBeGreaterThan(0.44)
    expect(got.at(-1)[0]).toBeLessThanOrEqual(0.8)
  })

  it('снятие всех источников останавливает цикл и шлёт (0,false) один раз', () => {
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    publishLevel('a', { playing: true, getLevel: () => 1 })
    frame(0)
    unpublishLevel('a')
    expect(hooks.isRunning()).toBe(false)
    expect(hasPlayingSources()).toBe(false)
    expect(got.at(-1)).toEqual([0, false])
    const n = got.length
    unpublishLevel('a') // повтор — ничего
    frame(100)
    expect(got.length).toBe(n)
  })

  it('publish с playing:false — то же, что unpublish', () => {
    subscribeAudioLevel(() => {})
    publishLevel('a', { playing: true, getLevel: () => 1 })
    publishLevel('a', { playing: false, getLevel: () => 1 })
    expect(hasPlayingSources()).toBe(false)
    expect(hooks.isRunning()).toBe(false)
  })

  it('троттлинг: не чаще 30 кадров/с, лишние кадры пропускаются', () => {
    let calls = 0
    subscribeAudioLevel((l, a) => { if (a) calls++ })
    publishLevel('a', { playing: true, getLevel: () => 1 })
    // 60 Гц: 0, 16.7, 33.3, 50, 66.7, 83.3 → засчитаны 0, 33.3, 66.7
    for (let i = 0; i < 6; i++) frame(i * 1000 / 60)
    expect(calls).toBe(3)
    expect(queue.length).toBe(1) // цикл продолжает ждать следующий кадр
  })

  it('скрытая вкладка: цикл стоит, подписчик получил (0,false)', () => {
    const got = []
    subscribeAudioLevel((l, a) => got.push(a))
    publishLevel('a', { playing: true, getLevel: () => 1 })
    frame(0)
    hidden = true
    frame(40)
    expect(hooks.isRunning()).toBe(false)
    expect(got.at(-1)).toBe(false)
  })

  it('отписка последнего подписчика гасит цикл, источник остаётся', () => {
    const off = subscribeAudioLevel(() => {})
    publishLevel('a', { playing: true, getLevel: () => 1 })
    off()
    expect(hooks.isRunning()).toBe(false)
    expect(hasPlayingSources()).toBe(true)
    // Новый подписчик — цикл поднимается снова
    subscribeAudioLevel(() => {})
    expect(hooks.isRunning()).toBe(true)
  })

  it('уровень зажат в 0..1 даже при кривом getLevel', () => {
    const got = []
    subscribeAudioLevel(l => got.push(l))
    publishLevel('a', { playing: true, getLevel: () => 5 })
    publishLevel('b', { playing: true, getLevel: () => NaN })
    for (let i = 0; i < 20; i++) frame(i * 40)
    expect(got.at(-1)).toBeLessThanOrEqual(1)
    expect(got.at(-1)).toBeGreaterThan(0.9)
  })
})

describe('levelFromWave / speechEnvelope', () => {
  it('берёт кадр волны по времени, край не выходит за массив', () => {
    const wd = [0, 255, 128]
    expect(levelFromWave(wd, 0, 30)).toBe(0)
    expect(levelFromWave(wd, 1 / 30, 30)).toBe(1)
    expect(levelFromWave(wd, 10, 30)).toBeCloseTo(Math.pow(128 / 255, 0.55), 5)
    expect(levelFromWave(wd, -1, 30)).toBe(0)
  })

  it('без волны — синтезированная огибающая в 0.35..0.85 после входа', () => {
    for (let t = 0.1; t < 3; t += 0.05) {
      const v = levelFromWave(null, t)
      expect(v).toBeGreaterThanOrEqual(0.35)
      expect(v).toBeLessThanOrEqual(0.85)
    }
    expect(speechEnvelope(0)).toBe(0)
    // Затухание в последних 0.15с
    expect(speechEnvelope(1.0, 1.0)).toBe(0)
    expect(speechEnvelope(0.5, 1.0)).toBeGreaterThan(0.3)
    expect(speechEnvelope(NaN)).toBe(0)
  })
})

describe('полосы и быстрый спад', () => {
  it('подписчик получает bands[4]; источник без getBands — синтез по профилю (ui-high → верх)', () => {
    let got = null
    subscribeAudioLevel((l, a, now, b) => { got = Array.from(b) })
    publishLevel('a', { playing: true, getLevel: () => 1, profile: 'ui-high' })
    for (let i = 0; i < 10; i++) frame(i * 40)
    expect(got.length).toBe(4)
    expect(got[3]).toBeGreaterThan(got[0] * 3)
    expect(got[3]).toBeGreaterThan(0.6)
  })

  it('getBands заполняет полосы напрямую; false — синтез', () => {
    let got = null
    subscribeAudioLevel((l, a, now, b) => { got = Array.from(b) })
    publishLevel('a', { playing: true, getLevel: () => 0.2, getBands: (now, out) => { out.set([1, 0, 0, 0]); return true } })
    for (let i = 0; i < 10; i++) frame(i * 40)
    expect(got[0]).toBeGreaterThan(0.9)
    expect(got[1]).toBe(0)
    unpublishLevel('a')
    publishLevel('b', { playing: true, getLevel: () => 1, getBands: () => false, profile: 'ui-low' })
    for (let i = 0; i < 10; i++) frame(1000 + i * 40)
    expect(got[0]).toBeGreaterThan(got[3] * 3)
  })

  it('быстрый спад: уровень < 0.05 за ≤ 8 кадров @30fps после тишины источника', () => {
    let lvl = 1
    const got = []
    subscribeAudioLevel(l => got.push(l))
    publishLevel('a', { playing: true, getLevel: () => lvl })
    for (let i = 0; i < 10; i++) frame(i * 40)
    expect(got.at(-1)).toBeGreaterThan(0.9)
    lvl = 0
    for (let i = 0; i < 8; i++) frame(1000 + i * 40)
    expect(got.at(-1)).toBeLessThan(0.05)
  })

  it('снятие последнего источника гасит сразу — (0,false) с нулевыми полосами, не ждёт спада', () => {
    let last = null
    subscribeAudioLevel((l, a, now, b) => { last = [l, a, Array.from(b)] })
    publishLevel('a', { playing: true, getLevel: () => 1 })
    for (let i = 0; i < 5; i++) frame(i * 40)
    expect(last[0]).toBeGreaterThan(0.8)
    unpublishLevel('a')
    expect(last).toEqual([0, false, [0, 0, 0, 0]])
  })

  it('synthBands: профили в 0..1, voice — низ+середина, ui-all — все', () => {
    const v = synthBands(1, 0.3, 'voice')
    expect(v[1]).toBeGreaterThan(v[3])
    for (const k of Object.keys(BAND_PROFILES)) {
      const b = synthBands(1, 2.2, k)
      for (let i = 0; i < 4; i++) { expect(b[i]).toBeGreaterThanOrEqual(0); expect(b[i]).toBeLessThanOrEqual(1) }
    }
    const all = synthBands(1, 0, 'ui-all')
    for (let i = 0; i < 4; i++) expect(all[i]).toBeGreaterThan(0.5)
    expect(synthBands(0, 1, 'ui-mid')).toEqual(new Float32Array(4))
  })
})

describe('порог «микро-звука»: MIN_LEVEL и гистерезис', () => {
  it('константы: включение 0.12, выключение 0.08, полоса ниже 0.08 → 0', () => {
    expect(MIN_LEVEL).toBe(0.12)
    expect(MIN_LEVEL_OFF).toBe(0.08)
    expect(BAND_FLOOR).toBe(0.08)
  })

  it('источник тише порога не даёт свечения вовсе (active=true не приходит)', () => {
    const got = []
    subscribeAudioLevel((l, a) => got.push(a))
    publishLevel('a', { playing: true, getLevel: () => 0.1 })
    for (let i = 0; i < 10; i++) frame(i * 40)
    expect(got.includes(true)).toBe(false)
    expect(hooks.isRunning()).toBe(true)   // цикл ждёт: источник может стать громче
  })

  it('гистерезис: вкл при ≥ 0.12, держится до < 0.08, обратно только от 0.12', () => {
    let lvl = 0.13
    const got = []
    subscribeAudioLevel((l, a) => got.push(a))
    publishLevel('a', { playing: true, getLevel: () => lvl, getBands: (n, out) => { out.set([0.5, 0.5, 0.5, 0.5]); return true } })
    const run = (from, n = 6) => { for (let i = 0; i < n; i++) frame(from + i * 40); return got.at(-1) }
    expect(run(0)).toBe(true)
    lvl = 0.1                          // между порогами — остаётся включённым
    expect(run(1000)).toBe(true)
    lvl = 0.07                         // ниже 0.08 — выключился, свет погас
    expect(run(2000, 10)).toBe(false)
    lvl = 0.1                          // между порогами, но был выключен — молчит
    expect(run(3000)).toBe(false)
    lvl = 0.13                         // ≥ 0.12 — снова включился
    expect(run(4000)).toBe(true)
  })

  it('паузы между словами: тихие участки гасят свет за ≤ 8 кадров, следующее слово зажигает снова', () => {
    let lvl = 0.8
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    publishLevel('voice', { playing: true, getLevel: () => lvl })
    for (let i = 0; i < 6; i++) frame(i * 40)
    expect(got.at(-1)[1]).toBe(true)
    lvl = 0.03
    for (let i = 0; i < 8; i++) frame(1000 + i * 40)
    expect(got.at(-1)).toEqual([0, false])
    const n = got.length
    for (let i = 0; i < 5; i++) frame(2000 + i * 40)     // тишина — подписчика не дёргаем
    expect(got.length).toBe(n)
    lvl = 0.6
    for (let i = 0; i < 3; i++) frame(3000 + i * 40)
    expect(got.at(-1)[1]).toBe(true)
  })

  it('тихий источник не вносит вклад, пока громкий играет: уровень и полосы — от громкого', () => {
    let last = null
    subscribeAudioLevel((l, a, now, b) => { last = [l, Array.from(b)] })
    publishLevel('quiet', { playing: true, getLevel: () => 0.1, getBands: (n, out) => { out.set([0, 0, 0, 1]); return true } })
    publishLevel('loud', { playing: true, getLevel: () => 0.5, getBands: (n, out) => { out.set([1, 0, 0, 0]); return true } })
    for (let i = 0; i < 10; i++) frame(i * 40)
    expect(last[0]).toBeGreaterThan(0.45)
    expect(last[0]).toBeLessThanOrEqual(0.5)
    expect(last[1][0]).toBeGreaterThan(0.9)
    expect(last[1][3]).toBe(0)
  })

  it('полоса ниже 0.08 → 0 (и у источника, и после сглаживания)', () => {
    let last = null
    subscribeAudioLevel((l, a, now, b) => { last = Array.from(b) })
    publishLevel('a', { playing: true, getLevel: () => 0.5, getBands: (n, out) => { out.set([0.5, 0.07, 0.2, 0.05]); return true } })
    for (let i = 0; i < 12; i++) frame(i * 40)
    expect(last[0]).toBeGreaterThan(0.45)
    expect(last[1]).toBe(0)
    expect(last[2]).toBeGreaterThan(0.15)
    expect(last[3]).toBe(0)
  })

  it('спад по-прежнему быстрый: от полной громкости до погасшего света ≤ 8 кадров @30fps (≈ 250 мс)', () => {
    let lvl = 1
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    publishLevel('a', { playing: true, getLevel: () => lvl })
    for (let i = 0; i < 10; i++) frame(i * 40)
    lvl = 0
    for (let i = 0; i < 8; i++) frame(1000 + i * 33.4)
    expect(got.at(-1)).toEqual([0, false])
  })
})
