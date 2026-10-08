import { describe, it, expect } from 'vitest'
import { drawExplode } from './phraseBubbleDraw.js'

// Холст-пустышка: drawExplode только вызывает методы рисования
const ctx = () => ({ beginPath() {}, moveTo() {}, arc() {}, fill() {} })
const bubble = (extra = {}) => ({ ax: 100, ay: 100, r: 1.5, vx: 0, vy: 0, t: 0, ...extra })

describe('drawExplode', () => {
  it('идёт, пока шарики живы, и сообщает о конце, когда все догорели', () => {
    expect(drawExplode(ctx(), [[bubble()]], 16, 300, 300)).toBe(false)
    expect(drawExplode(ctx(), [[bubble({ t: 100000 })]], 16, 300, 300)).toBe(true)
  })

  it('время кадра чуть раньше старта (dt < 0) не ломает отрисовку — раньше NaN в альфе падал на push', () => {
    expect(() => drawExplode(ctx(), [[bubble({ t: -3 })]], 0, 300, 300)).not.toThrow()
    expect(() => drawExplode(ctx(), [[bubble({ t: 0 })]], -5, 300, 300)).not.toThrow()
  })

  it('шарик с NaN в положении пропускается, остальные рисуются', () => {
    expect(() => drawExplode(ctx(), [[bubble({ ax: NaN }), bubble()]], 16, 300, 300)).not.toThrow()
  })

  it('догоревшие частицы выбрасываются из списка на месте; пустые и дырявые списки не мешают', () => {
    const list = [bubble({ t: 100000 }), bubble(), bubble({ t: 100000 })]
    expect(drawExplode(ctx(), [undefined, list, []], 16, 300, 300)).toBe(false)
    expect(list).toHaveLength(1)
    expect(drawExplode(ctx(), [], 16, 300, 300)).toBe(true)
  })

  it('частица не вылетает за край холста: положение зажато в [0, w] × [0, h]', () => {
    const b = bubble({ ax: 299, ay: 1, vx: 500, vy: -500 })
    drawExplode(ctx(), [[b]], 16, 300, 300)
    expect(b.ax).toBeLessThanOrEqual(300)
    expect(b.ay).toBeGreaterThanOrEqual(0)
  })
})
