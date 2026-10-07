import { describe, it, expect } from 'vitest'
import { popPlace, ORBIT_RX } from './memoryCountPop.js'

// Круг-счётчик на телефоне 375 px: блок 100×100 по центру зоны, центр (190, 270)
const rect = { left: 140, width: 100, top: 220, height: 100, bottom: 320 }

describe('popPlace — окошко счётчика', () => {
  it('окно строго по центру экрана по ширине', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(Math.abs(p.left + p.width / 2 - 375 / 2)).toBeLessThanOrEqual(0.5)
    expect(p.width).toBe(320)
    expect(p.left).toBeGreaterThanOrEqual(16)
  })

  it('верх окна ниже круга орбит и ниже самого круглого блока — точки и обводка круга остаются видны', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(p.top).toBeGreaterThan(270 + ORBIT_RX + 4)
    expect(p.top - 8).toBeGreaterThanOrEqual(rect.bottom + 4) // кончик уголка под блоком
    // широкое число (орбиты почти до края круга) — окно всё равно не выше низа блока
    const wide = popPlace({ rect, vw: 375, k: 1.9 })
    expect(wide.top - 8).toBeGreaterThanOrEqual(rect.bottom + 4)
  })

  it('уголок смотрит на число', () => {
    const p = popPlace({ rect, vw: 375, k: 1 })
    expect(p.left + p.caretX).toBe(190)
  })

  it('на узком экране ширина — экран минус поля, а уголок не заходит на скруглённый угол', () => {
    const edge = { left: 250, width: 100, top: 220, height: 100, bottom: 320 }
    const p = popPlace({ rect: edge, vw: 320, k: 1 })
    expect(p.width).toBe(288)
    expect(p.caretX).toBeLessThanOrEqual(p.width - 22)
    expect(p.caretX).toBeGreaterThanOrEqual(22)
  })
})
