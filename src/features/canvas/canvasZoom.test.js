import { describe, it, expect } from 'vitest'
import { clampScale, wheelZoomFactor, zoomAtPoint, MIN_SCALE, MAX_SCALE } from './canvasZoom.js'

describe('clampScale', () => {
  it('держит масштаб в диапазоне', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(1.4)).toBe(1.4)
  })
})

describe('wheelZoomFactor', () => {
  it('щелчок мыши вниз уменьшает примерно на 10%', () => {
    const f = wheelZoomFactor({ deltaY: 100, deltaMode: 0 })
    expect(f).toBeGreaterThan(0.87)
    expect(f).toBeLessThan(0.92)
  })

  it('щелчок вверх увеличивает симметрично', () => {
    const down = wheelZoomFactor({ deltaY: 100, deltaMode: 0 })
    const up = wheelZoomFactor({ deltaY: -100, deltaMode: 0 })
    expect(up * down).toBeCloseTo(1, 6)
  })

  it('мелкая дельта трекпада даёт мелкий шаг, а не те же 10%', () => {
    const f = wheelZoomFactor({ deltaY: 4, deltaMode: 0 })
    expect(Math.abs(1 - f)).toBeLessThan(0.01)
  })

  it('строчные и страничные дельты приводятся к пикселям', () => {
    expect(wheelZoomFactor({ deltaY: 3, deltaMode: 1 }))
      .toBeCloseTo(wheelZoomFactor({ deltaY: 48, deltaMode: 0 }), 6)
    expect(wheelZoomFactor({ deltaY: 1, deltaMode: 2 })).toBeLessThan(1)
  })

  it('резкий флик не перебрасывает масштаб разом', () => {
    const f = wheelZoomFactor({ deltaY: 100000, deltaMode: 0 })
    expect(f).toBeGreaterThan(0.7)
  })

  it('пинч (ctrl+wheel) заметнее обычного колеса при той же дельте', () => {
    const pinch = wheelZoomFactor({ deltaY: -10, deltaMode: 0, ctrlKey: true })
    const wheel = wheelZoomFactor({ deltaY: -10, deltaMode: 0 })
    expect(pinch).toBeGreaterThan(wheel)
  })
})

describe('zoomAtPoint', () => {
  it('точка под курсором остаётся на месте', () => {
    const offset = { x: -300, y: 120 }
    const cur = 1, next = 1.1
    const px = 400, py = 250
    const o2 = zoomAtPoint(offset, cur, next, px, py)
    // экранная позиция мировой точки до и после зума
    const world = { x: (px - offset.x) / cur, y: (py - offset.y) / cur }
    expect(world.x * next + o2.x).toBeCloseTo(px, 6)
    expect(world.y * next + o2.y).toBeCloseTo(py, 6)
  })

  it('без смены масштаба ничего не двигает', () => {
    const offset = { x: 10, y: -20 }
    expect(zoomAtPoint(offset, 1.5, 1.5, 300, 300)).toEqual(offset)
  })
})
