import { describe, it, expect } from 'vitest'
import { clampWindowPos, inResizeCorner } from './useDragWindow.js'

describe('clampWindowPos', () => {
  const size = { w: 500, h: 400 }, vp = { vw: 1600, vh: 900 }
  it('внутри области — без изменений', () => {
    expect(clampWindowPos({ x: 100, y: 50 }, size, vp)).toEqual({ x: 100, y: 50 })
  })
  it('наружу можно почти целиком, край 120px остаётся', () => {
    expect(clampWindowPos({ x: -1000, y: 0 }, size, vp)).toEqual({ x: -380, y: 0 })
    expect(clampWindowPos({ x: 5000, y: 5000 }, size, vp)).toEqual({ x: 1480, y: 780 })
    expect(clampWindowPos({ x: 0, y: -50 }, size, vp)).toEqual({ x: 0, y: 0 })
  })
  it('ручка ресайза — только правый нижний угол', () => {
    const rect = { right: 800, bottom: 600 }
    expect(inResizeCorner(rect, 790, 590)).toBe(true)
    expect(inResizeCorner(rect, 500, 590)).toBe(false)
    expect(inResizeCorner(rect, 790, 100)).toBe(false)
  })
})
