import { describe, it, expect, vi } from 'vitest'
import { createOrderGame, stepOrder, failPrompt } from '../player/modules/rotate-phone/wordLaneOrder.js'
import { startFlight, FLIGHT_MS } from '../player/modules/rotate-phone/wordLaneMotion.js'
import { createPool } from '../player/modules/rotate-phone/wordLanePool.js'

// Точки расширения движка для «Гонки с Питом» (CONCEPT_RACE.md, §4): failPrompt, скорость полёта пилюли и подпись внутри пилюли (пул). Сцена «Порядок» в режиме speak («Слушай и лови» тремя пилюлями) удалена: этап 2 — инверсия разгона на ступени ученика (raceCatch*.test.js).
describe('движок: failPrompt, скорость полёта, подпись пилюли', () => {
  it('failPrompt: попытки кончились — подсказка потеряна и раунд закончен; stepOrder даёт тот же результат по времени', () => {
    const g = createOrderGame({ prompts: [{ parts: [0], answer: [0], slots: [0], texts: ['a'] }], lanes: [0, 1, 2], maxTries: 2 })
    stepOrder(g, 600)
    expect(failPrompt(g, 700).map(e => e.type)).toEqual(['fail']); expect(g.tries).toBe(1); expect(g.state).toBe('gap')
    const last = failPrompt(g, 800)
    expect(last.map(e => e.type)).toEqual(['fail', 'done']); expect(last[0].lost).toBe(true); expect(g.finished).toBe(true)
  })
  it('startFlight: скорость — playbackRate, положение по часам = время × скорость; без скорости всё как было', () => {
    const anim = {}
    const el = { animate: vi.fn(() => anim) }
    startFlight(el, 1000); expect(anim.currentTime).toBe(1000); expect(anim.playbackRate).toBeUndefined()
    startFlight(el, 1000, 1.1); expect(anim.playbackRate).toBe(1.1); expect(anim.currentTime).toBeCloseTo(1100, 5)
    expect(FLIGHT_MS).toBeGreaterThan(0)
  })
  it('пул: take(lane, { cap, speed }) пишет data-cap и запускает полёт на скорости; clean снимает подпись; pool.cap меняет её', () => {
    const attrs = new Map()
    const part = () => ({ style: { setProperty() {} }, offsetHeight: 100, setAttribute() {}, removeAttribute() {}, querySelector: () => null })
    const mk = () => ({ dataset: {}, style: { setProperty() {} }, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, animate: () => ({ cancel() {} }), querySelector: () => part(), querySelectorAll: () => [], classList: { contains: () => true } })
    const el = mk()
    const root = { querySelectorAll: sel => (sel === '[data-pill]' ? [el] : []), classList: { contains: () => true }, querySelector: () => null }
    const pool = createPool(root)
    const k = pool.take(1, { cap: 'пытаюсь', speed: 1.05 })
    expect(attrs.get('data-cap')).toBe('пытаюсь')
    pool.cap(k, 'trying'); expect(attrs.get('data-cap')).toBe('trying')
    pool.cap(k, ''); expect(attrs.has('data-cap')).toBe(false)
    pool.give(k); pool.take(1, {}); expect(attrs.has('data-cap')).toBe(false) // без подписи пилюля чистая
    const k2 = pool.take(1, {})
    expect(() => pool.linger(k2, { to: 60, ms: 1000 })).not.toThrow() // упущенная пилюля всплывает и гаснет (WAAPI-заглушка из мока)
  })
})
