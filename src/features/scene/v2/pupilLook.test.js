import { describe, it, expect, vi } from 'vitest'
import { createPupilLook, MAX_LOOK, GAZE, IDLE_MIN_MS, IDLE_MAX_MS, IDLE_AWAY_MS, SACCADE_X } from './pupilLook.js'
import { MASCOT_PACKS } from './sprites/mascot/mascots.js'

const K = MASCOT_PACKS.kit.fit.k

// Корни маскотов с style.setProperty / removeProperty; таймеры и случайность — руками
function setup({ whos = ['a', 'b'], rands = [] } = {}) {
  const els = {}
  for (const w of whos) {
    const p = {}
    els[w] = { p, style: { setProperty: (k, v) => { p[k] = v }, removeProperty: k => { delete p[k] } } }
  }
  const timers = []
  let id = 0
  const t = {
    setTimeout: (fn, ms) => { timers.push({ id: ++id, fn, ms }); return id },
    clearTimeout: i => { const k = timers.findIndex(x => x.id === i); if (k >= 0) timers.splice(k, 1) },
  }
  let r = 0
  const rand = () => (r < rands.length ? rands[r++] : 0.5)
  const look = createPupilLook({ whos, getEl: w => els[w], skinOf: () => 'kit', timers: t, rand })
  const px = w => ({ x: +els[w].p['--look-x'] * K, y: +els[w].p['--look-y'] * K }) // обратно в px спрайта (с зеркалом)
  return { look, els, timers, px }
}

describe('pupilLook — зрачки под речь', () => {
  it('начало реплики: оба смотрят друг на друга, сдвиг ≈ GAZE (≤ MAX_LOOK px спрайта); в пакете «на собеседника» у обоих — минус по x (a зеркалится, b нет)', () => {
    const s = setup()
    s.look.lineStart('a')
    for (const w of ['a', 'b']) {
      expect(+s.els[w].p['--look-x']).toBeLessThan(0)
      expect(Math.abs(s.px(w).x)).toBeCloseTo(GAZE, 1)
    }
    expect(Math.abs(s.px('a').x)).toBeLessThanOrEqual(MAX_LOOK)
  })

  it('одиночная сцена: взгляд прямо (0), собеседника нет', () => {
    const s = setup({ whos: ['a'] })
    s.look.lineStart('a')
    expect(+s.els.a.p['--look-x']).toBe(0)
    expect(+s.els.a.p['--look-y']).toBe(0)
  })

  it('граница слова: с вероятностью 1/3 саккада (в пределах ±0,6 px), иначе остаётся / возвращается на собеседника', () => {
    const s = setup({ whos: ['a'], rands: [0.1, 1, 0.5, /* саккада */ 0.9 /* без саккады */] })
    s.look.lineStart('a')
    s.look.word('a')                       // rand 0.1 < 1/3 → саккада: x = (1*2-1)*0.6 = +0,6, y = 0
    expect(Math.abs(s.px('a').x)).toBeCloseTo(SACCADE_X, 1)
    s.look.word('a')                       // rand 0.9 → без саккады, сбитый взгляд возвращается в 0
    expect(+s.els.a.p['--look-x']).toBeCloseTo(0)
  })

  it('какие бы ни выпали числа, сдвиг не больше MAX_LOOK px спрайта', () => {
    for (const v of [0, 0.01, 0.99, 1]) {
      const s = setup({ rands: [0, v, v, v, v, v, v, v] })
      s.look.lineStart('b')
      for (let i = 0; i < 4; i++) s.look.word('b')
      for (const w of ['a', 'b']) expect(Math.abs(s.px(w).x)).toBeLessThanOrEqual(MAX_LOOK + 1e-6)
    }
  })

  it('тишина: раз в 3–5 с лёгкий увод у НЕ говорящего и возврат через IDLE_AWAY_MS; говорящего не трогаем', () => {
    const s = setup({ rands: [0.5, 0.0, 0.0, 0.5, 0.5, 0.5] })
    s.look.lineStart('a')
    s.look.startIdle()
    expect(s.timers).toHaveLength(1)
    expect(s.timers[0].ms).toBeGreaterThanOrEqual(IDLE_MIN_MS)
    expect(s.timers[0].ms).toBeLessThanOrEqual(IDLE_MAX_MS)
    s.timers.shift().fn()                  // увод: единственный молчащий — b
    expect(s.els.b.p['--look-x']).toBeDefined()
    expect(s.timers.map(x => x.ms)).toContain(IDLE_AWAY_MS)
    expect(s.timers).toHaveLength(2)       // возврат + следующий увод
  })

  it('startIdle дважды — один таймер; stopIdle и stop снимают таймеры, stop убирает переменные', () => {
    const s = setup()
    s.look.lineStart('a')
    s.look.startIdle(); s.look.startIdle()
    expect(s.timers).toHaveLength(1)
    s.look.stopIdle()
    expect(s.timers).toHaveLength(0)
    s.look.stop()
    expect(s.els.a.p['--look-x']).toBeUndefined()
    expect(s.els.b.p['--look-y']).toBeUndefined()
  })

  it('нет корня маскота / не маскот — тихо ничего не делает', () => {
    const look = createPupilLook({ whos: ['a'], getEl: () => null, skinOf: () => null, timers: { setTimeout: vi.fn(), clearTimeout: vi.fn() } })
    expect(() => { look.lineStart('a'); look.word('a'); look.lineEnd(); look.stop() }).not.toThrow()
  })
})
