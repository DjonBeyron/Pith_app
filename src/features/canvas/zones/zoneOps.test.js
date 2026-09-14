import { describe, it, expect } from 'vitest'
import {
  rectFromDrag, applyZoneMove, applyZoneResize, zoneColorVars,
  MIN_ZONE_W, MIN_ZONE_H, DEFAULT_ZONE_COLOR, ZONE_COLOR_PRESETS,
} from './zoneOps.js'

describe('rectFromDrag — новая зона из протяжки', () => {
  it('нормализует прямоугольник независимо от направления протяжки', () => {
    const z = rectFromDrag({ x: 300, y: 250 }, { x: 100, y: 50 })
    expect(z).toMatchObject({ x: 100, y: 50, width: 200, height: 200 })
    expect(z.label).toBeTruthy()
    expect(z.id).toBeTruthy()
  })

  it('новая зона получает цвет по умолчанию', () => {
    const z = rectFromDrag({ x: 0, y: 0 }, { x: 200, y: 200 })
    expect(z.color).toBe(DEFAULT_ZONE_COLOR)
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

describe('zoneColorVars — hex цвета в CSS-переменные', () => {
  it('раскладывает брендовый лайм в три уровня прозрачности', () => {
    const vars = zoneColorVars(DEFAULT_ZONE_COLOR)
    expect(vars['--zoneBorder']).toBe('rgba(182, 254, 59, 0.32)')
    expect(vars['--zoneBg']).toBe('rgba(182, 254, 59, 0.045)')
    expect(vars['--zoneGrip']).toBe('rgba(182, 254, 59, 0.22)')
    expect(vars['--zoneGripHover']).toBe('rgba(182, 254, 59, 0.65)')
  })

  it('битый/пустой цвет не падает — откатывается на дефолт', () => {
    expect(zoneColorVars(undefined)['--zoneBorder']).toBe('rgba(182, 254, 59, 0.32)')
    expect(zoneColorVars('не-hex')['--zoneBorder']).toBe('rgba(182, 254, 59, 0.32)')
  })

  it('палитра пресетов начинается с цвета по умолчанию', () => {
    expect(ZONE_COLOR_PRESETS[0]).toBe(DEFAULT_ZONE_COLOR)
    expect(ZONE_COLOR_PRESETS.length).toBeGreaterThan(1)
  })
})
