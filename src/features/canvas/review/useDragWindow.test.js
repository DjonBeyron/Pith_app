import { describe, it, expect } from 'vitest'
import { clampWindowPos } from './useDragWindow.js'

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
})
