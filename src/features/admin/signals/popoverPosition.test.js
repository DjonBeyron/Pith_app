import { describe, it, expect } from 'vitest'
import { popoverPosition } from './popoverPosition.js'

const rect = (left, top, s = 20) => ({ left, top, right: left + s, bottom: top + s })
const inside = (p, size, vp, margin = 8) =>
  p.left >= margin && p.left + p.width <= vp.w - margin + 0.01 && p.top >= margin && p.top + Math.min(size.h, p.maxHeight) <= vp.h - margin + 0.01

describe('popoverPosition', () => {
  const phone = { w: 390, h: 844 }
  const desk = { w: 1440, h: 900 }

  it('по центру под кнопкой, если место есть', () => {
    const p = popoverPosition(rect(600, 100), { w: 300, h: 120 }, desk)
    expect(p.placement).toBe('below')
    expect(p.left).toBe(610 - 150)
    expect(p.top).toBe(120 + 6)
  })

  it('не вылезает за границы на 390 и 1440 (углы и края)', () => {
    const size = { w: 300, h: 200 }
    for (const vp of [phone, desk]) {
      for (const x of [0, 4, vp.w / 2, vp.w - 24, vp.w - 4]) {
        for (const y of [0, 10, vp.h / 2, vp.h - 30, vp.h - 4]) {
          const p = popoverPosition(rect(x, y), size, vp)
          expect(inside(p, size, vp), `${vp.w}: ${x},${y}`).toBe(true)
        }
      }
    }
  })

  it('внизу экрана открывается вверх', () => {
    const p = popoverPosition(rect(100, 800), { w: 300, h: 200 }, phone)
    expect(p.placement).toBe('above')
    expect(p.top + 200).toBeLessThanOrEqual(800 - 6)
  })

  it('на узком экране ширина сжимается до окна с полями', () => {
    const p = popoverPosition(rect(10, 100), { w: 400, h: 100 }, phone)
    expect(p.width).toBe(390 - 16)
    expect(p.left).toBe(8)
  })

  it('слишком высокая подсказка режется по maxHeight на ту сторону, где больше места', () => {
    const p = popoverPosition(rect(100, 400), { w: 300, h: 2000 }, { w: 390, h: 800 })
    expect(p.maxHeight).toBeLessThanOrEqual(800)
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(800 - 8 + 0.01)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})
