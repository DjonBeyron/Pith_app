import { describe, it, expect } from 'vitest'
import { computeFeedFrame, catsInkBox, SCENE_W } from './feedFrameCalc.js'
import { FEED_DEVICES, navHeight } from './feedSlideGeometry.js'

// Кадр слайда ленты для одиночной сцены (один кот по центру): рамка одного кота, без предупреждений на всех экранах
const run = (d, solo, frame) => computeFeedFrame({ w: d.w, h: d.h, navH: navHeight(d.sab), safeTop: d.sat, frame, solo })
const zoneOf = (r, id) => r.zones.find(z => z.id === id)

describe('computeFeedFrame — одиночная сцена', () => {
  it('рамка чернил одного кота: уже двух, по центру сцены, та же высота', () => {
    const duo = catsInkBox()
    const solo = catsInkBox(true)
    expect(solo.r - solo.l).toBeLessThan(duo.r - duo.l)
    // по центру стоит ГОЛОВА (x 180); чернила с хвостом справа смещены на ~10 единиц — это ожидаемо
    expect(Math.abs((solo.l + solo.r) / 2 - SCENE_W / 2)).toBeLessThan(12)
    expect(solo.t).toBe(duo.t)
    expect(solo.b).toBe(duo.b)
  })

  for (const d of FEED_DEVICES) {
    it(`на ${d.label}: одиночный кот целиком на экране, не под зонами; ноги там же, где у двух котов`, () => {
      const r = run(d, true)
      expect(r.warnings).toEqual([])
      expect(r.cats.l).toBeGreaterThan(0)
      expect(r.cats.r).toBeLessThan(d.w)
      expect(r.cats.b).toBeLessThanOrEqual(zoneOf(r, 'phrase').t)
      expect(r.cats.r).toBeLessThan(zoneOf(r, 'hud').l)
      expect(r.ty).toBe(run(d, false).ty) // якорь bottom: ноги котов на одной высоте
      expect(r.bubbleBottom).toBe(run(d, false).bubbleBottom)
    })
  }

  it('сдвиг кадра вправо на треть ширины: один кот ещё в экране, два — уже за краем', () => {
    const d = FEED_DEVICES[0]
    const frame = { scale: 1, x: 0.3, y: 0 }
    expect(run(d, true, frame).warnings.some(w => w.zone === 'edge')).toBe(false)
    expect(run(d, false, frame).warnings.some(w => w.zone === 'edge')).toBe(true)
  })
})
