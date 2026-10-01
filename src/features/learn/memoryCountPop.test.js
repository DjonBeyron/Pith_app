import { describe, it, expect } from 'vitest'
import { popPlace, ORBIT_RX } from './memoryCountPop.js'

// Кнопка счётчика на телефоне 375 px: 88×60, центр (316, 274)
const rect = { left: 272, width: 88, top: 244, height: 60, bottom: 304 }

describe('popPlace — окошко счётчика', () => {
  it('есть место слева — углом к цифре, правее и ниже центра не заходит', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(p.corner).toBe(true)
    const cornerX = 375 - p.right
    const cornerY = p.top
    // угол окна вне круга орбит (радиус ORBIT_RX + точка) вокруг центра числа
    const dist = Math.hypot(cornerX - 316, cornerY - 274)
    expect(dist).toBeGreaterThan(ORBIT_RX + 4)
    expect(cornerX).toBeLessThan(316)
    expect(cornerY).toBeGreaterThan(274)
    expect(p.width).toBeLessThanOrEqual(280)
    expect(cornerX - p.width).toBeGreaterThanOrEqual(16) // слева остаётся поле
  })

  it('чем шире число (орбиты больше), тем дальше угол от центра', () => {
    const a = popPlace({ rect, vw: 375, k: 1 })
    const b = popPlace({ rect, vw: 375, k: 1.7 })
    expect(375 - b.right).toBeLessThan(375 - a.right)
    expect(b.top).toBeGreaterThan(a.top)
  })

  it('на широком экране ширина — до 280', () => {
    const wide = { left: 700, width: 88, top: 244, height: 60, bottom: 304 }
    expect(popPlace({ rect: wide, vw: 1200, k: 1 }).width).toBe(280)
  })

  it('слева мало места — под кнопкой, как раньше', () => {
    const narrow = { left: 190, width: 88, top: 244, height: 60, bottom: 304 }
    expect(popPlace({ rect: narrow, vw: 320, k: 1 })).toEqual({ corner: false, top: 308 })
  })
})
