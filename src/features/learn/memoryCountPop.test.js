import { describe, it, expect } from 'vitest'
import { popPlace, ORBIT_RX } from './memoryCountPop.js'

// Кнопка счётчика на телефоне 375 px: 88×60, центр (316, 274)
const rect = { left: 272, width: 88, top: 244, height: 60, bottom: 304 }

describe('popPlace — окошко счётчика', () => {
  it('окно строго по центру экрана по ширине', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(Math.abs(p.left + p.width / 2 - 375 / 2)).toBeLessThanOrEqual(0.5)
    expect(p.width).toBe(320)
    expect(p.left).toBeGreaterThanOrEqual(16)
  })

  it('верх окна ниже круга орбит вокруг числа — точки остаются видны', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(p.top).toBeGreaterThan(274 + ORBIT_RX + 4)
  })

  it('уголок смотрит на число', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(p.left + p.caretX).toBe(316)
  })

  it('чем шире число (орбиты больше), тем ниже окно', () => {
    expect(popPlace({ rect, vw: 375, k: 1.7 }).top).toBeGreaterThan(popPlace({ rect, vw: 375, k: 1 }).top)
  })

  it('на узком экране ширина — экран минус поля, а уголок не заходит на скруглённый угол', () => {
    const edge = { left: 250, width: 88, top: 244, height: 60, bottom: 304 }
    const p = popPlace({ rect: edge, vw: 320, k: 1 })
    expect(p.width).toBe(288)
    expect(p.caretX).toBeLessThanOrEqual(p.width - 22)
    expect(p.caretX).toBeGreaterThanOrEqual(22)
  })
})
