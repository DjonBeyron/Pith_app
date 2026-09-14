import { describe, it, expect } from 'vitest'
import { rectFromDrag, applyZoneMove, applyZoneResize, MIN_ZONE_W, MIN_ZONE_H } from './zoneOps.js'

describe('rectFromDrag — новая зона из протяжки', () => {
  it('нормализует прямоугольник независимо от направления протяжки', () => {
    const z = rectFromDrag({ x: 300, y: 250 }, { x: 100, y: 50 })
    expect(z).toMatchObject({ x: 100, y: 50, width: 200, height: 200 })
    expect(z.label).toBeTruthy()
    expect(z.id).toBeTruthy()
  })

  it('слишком короткая протяжка — не зона, а случайный клик', () => {
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull()
  })

  it('маленькая, но не случайная протяжка не проваливается ниже минимального размера', () => {
    const z = rectFromDrag({ x: 0, y: 0 }, { x: 20, y: 20 })
    expect(z.width).toBe(MIN_ZONE_W)
    expect(z.height).toBe(MIN_ZONE_H)
  })
})

describe('applyZoneMove', () => {
  it('сдвигает и x, и y на дельту, размер не трогает', () => {
    const zone = { x: 10, y: 20, width: 100, height: 80 }
    expect(applyZoneMove(zone, 5, -5)).toEqual({ x: 15, y: 15, width: 100, height: 80 })
  })
})

describe('applyZoneResize — растяжка за ручку', () => {
  const zone = { x: 100, y: 100, width: 200, height: 150 }

  it('растяжка за восточную/южную сторону не двигает левый/верхний край', () => {
    const r = applyZoneResize(zone, 'se', 50, 30)
    expect(r).toMatchObject({ x: 100, y: 100, width: 250, height: 180 })
  })

  it('растяжка за западную/северную сторону двигает угол вместе с размером', () => {
    const r = applyZoneResize(zone, 'nw', -30, -20)
    expect(r).toMatchObject({ x: 70, y: 80, width: 230, height: 170 })
  })

  it('не даёт схлопнуть зону меньше минимального размера', () => {
    const r = applyZoneResize(zone, 'se', -1000, -1000)
    expect(r.width).toBe(MIN_ZONE_W)
    expect(r.height).toBe(MIN_ZONE_H)
  })
})
