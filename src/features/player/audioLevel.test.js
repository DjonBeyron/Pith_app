import { describe, it, expect, beforeEach } from 'vitest'
import {
  publishLevel, unpublishLevel, subscribeAudioLevel, hasPlayingSources,
  levelFromWave, speechEnvelope, _audioLevelTestHooks,
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
    // Атака 0.55 от нуля к 0.8
    expect(got.at(-1)).toEqual([0.44, true])
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

describe('audioGlowShape: однородная масса', () => {
  it('узлы шире шага и перекрывают соседей без зазоров', async () => {
    const { BARS, BAR_COUNT, BAR_SPAN } = await import('./audioGlowShape.js')
    expect(BAR_COUNT).toBeLessThanOrEqual(18)
    expect(BAR_SPAN).toBeGreaterThanOrEqual(1.6) // перекрытие ≥ 60 %
    for (let i = 1; i < BAR_COUNT; i++) {
      const prev = BARS[i - 1], cur = BARS[i]
      expect(cur.left).toBeLessThan(prev.left + prev.width) // соседи перекрываются
      expect(cur.left + cur.width).toBeGreaterThan(prev.left + prev.width)
    }
    expect(BARS[0].left).toBeLessThan(0)                          // крайние уходят за край
    expect(BARS[BAR_COUNT - 1].left + BARS[BAR_COUNT - 1].width).toBeGreaterThan(100)
  })

  it('высота и яркость в пределах, соседи близки (нет полос), в тишине — тусклая низкая масса', async () => {
    const { barShape, BAR_COUNT, MIN_SCALE, MIN_ALPHA } = await import('./audioGlowShape.js')
    for (const t of [0.3, 1.37, 4.9]) {
      const shapes = Array.from({ length: BAR_COUNT }, (_, i) => barShape(i, 1, t))
      for (const { scale, alpha } of shapes) {
        expect(scale).toBeGreaterThanOrEqual(MIN_SCALE); expect(scale).toBeLessThanOrEqual(1)
        expect(alpha).toBeGreaterThanOrEqual(MIN_ALPHA); expect(alpha).toBeLessThanOrEqual(1)
      }
      // Гладкость по горизонтали: соседние узлы отличаются немного
      for (let i = 1; i < BAR_COUNT; i++) {
        expect(Math.abs(shapes[i].scale - shapes[i - 1].scale)).toBeLessThan(0.2)
        expect(Math.abs(shapes[i].alpha - shapes[i - 1].alpha)).toBeLessThan(0.2)
      }
      // …но яркость по длине «гуляет», а не ровная
      const alphas = shapes.map(s => s.alpha)
      expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.1)
    }
    for (let i = 0; i < BAR_COUNT; i++) {
      const s = barShape(i, 0, 5)
      expect(s.alpha).toBe(MIN_ALPHA)
      expect(s.scale).toBeLessThan(0.3)
    }
  })

  it('сдвиг подложки идёт по кругу в 0..-50 % (узор периодичен)', async () => {
    const { baseShift } = await import('./audioGlowShape.js')
    for (let t = 0; t < 30; t += 0.37) {
      expect(baseShift(t)).toBeLessThanOrEqual(0)
      expect(baseShift(t)).toBeGreaterThan(-50)
    }
  })
})
