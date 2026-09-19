import { describe, it, expect } from 'vitest'
import { cubicBezier, easingFn } from './cubicBezier.js'

// Солвер должен давать ту же кривую, что браузер: по ней сэмплируются кадры
// истории, которая едет за панелью (panelRise.js)
describe('cubicBezier', () => {
  it('linear — тождество, концы точные', () => {
    const f = cubicBezier(0, 0, 1, 1)
    for (const t of [0, 0.1, 0.5, 0.9, 1]) expect(f(t)).toBeCloseTo(t, 4)
  })

  it('ease-out панели (0.22, 1, 0.36, 1): монотонна, к середине уже далеко', () => {
    const f = cubicBezier(0.22, 1, 0.36, 1)
    let prev = 0
    for (let i = 1; i <= 20; i++) {
      const v = f(i / 20)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-6)
      prev = v
    }
    expect(f(0.5)).toBeGreaterThan(0.85)
    expect(f(1)).toBe(1)
  })

  it('ease-in спуска (0.4, 0, 1, 1): медленный старт', () => {
    const f = cubicBezier(0.4, 0, 1, 1)
    expect(f(0.25)).toBeLessThan(0.1)
    expect(f(0.5)).toBeLessThan(0.35)
  })

  it('easingFn разбирает CSS-строку, незнакомое — linear', () => {
    expect(easingFn('cubic-bezier(0.22, 1, 0.36, 1)')(0.5)).toBeGreaterThan(0.85)
    expect(easingFn('ease')(0.3)).toBe(0.3)
  })

  it('касание истории с панелью: p_c = 1 − drop/panelH — зазор в конце равен зазору при касании', () => {
    // panelH=263, drop=235 (распорка подняла историю на 235): панель проходит
    // 263·(1−p_c)=235 до касания, дальше обе едут вместе оставшиеся 28
    const panelH = 263, drop = 235
    const pc = 1 - drop / panelH
    const hold = p => Math.min(drop, panelH * (1 - p))
    expect(hold(0)).toBe(drop)              // старт: история на старом месте
    expect(hold(pc)).toBeCloseTo(drop, 6)   // до касания не двигалась
    expect(hold((pc + 1) / 2)).toBeLessThan(drop)
    expect(hold(1)).toBe(0)                 // финиш: на новом месте
  })
})
