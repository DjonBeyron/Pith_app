import { describe, it, expect } from 'vitest'
import { computeFeedFrame, feedFrameVars, dragFeedFrame, catsInkBox, SCENE_W } from './feedFrameCalc.js'
import { FEED_DEVICES, navHeight, feedZones } from './feedSlideGeometry.js'

const dev = id => FEED_DEVICES.find(d => d.id === id)
const run = (d, frame) => computeFeedFrame({ w: d.w, h: d.h, navH: navHeight(d.sab), safeTop: d.sat, frame })
const zoneOf = (r, id) => r.zones.find(z => z.id === id)

describe('computeFeedFrame — кадр сцены на слайде ленты', () => {
  it('рамка котов во вьюбоксе: внутри сцены 360×640, ниже голов стола, выше низа', () => {
    const c = catsInkBox()
    expect(c.l).toBeGreaterThan(0)
    expect(c.r).toBeLessThan(SCENE_W)
    expect(c.t).toBeGreaterThan(440)
    expect(c.b).toBeLessThan(640)
  })

  for (const d of FEED_DEVICES) {
    it(`по умолчанию на ${d.label}: коты целиком на экране и не под кнопкой, фразой, HUD, панелями`, () => {
      const r = run(d)
      expect(r.warnings).toEqual([])
      expect(r.cats.l).toBeGreaterThanOrEqual(0)
      expect(r.cats.r).toBeLessThanOrEqual(d.w)
      expect(r.cats.t).toBeGreaterThan(zoneOf(r, 'top').b)
      // ноги котов выше блока фразы на 2 строки (он выше кнопки) — а значит и выше кнопки «Изучить фразу»
      expect(r.cats.b).toBeLessThanOrEqual(zoneOf(r, 'phrase').t)
      expect(r.cats.b).toBeLessThan(zoneOf(r, 'learn').t)
      expect(r.cats.r).toBeLessThan(zoneOf(r, 'hud').l) // справа от котов — HUD
      // сцена не уезжает вниз: верх SVG не ниже верха слайда (нет пустоты над стеной)
      expect(r.base).toBeLessThanOrEqual(0)
    })
  }

  it('старый вид (до 3.2.2003) на окне Safari 390×664 обрезал бы котов — теперь нет', () => {
    const d = dev('safari')
    const old = run(d, { anchor: 'top' }) // сцена прижата к верху, как раньше
    expect(old.warnings.map(w => w.zone)).toEqual(expect.arrayContaining(['phrase', 'learn']))
    expect(run(d).warnings).toEqual([])
  })

  it('anchor: top — SVG у верха; center — коты по центру свободной полосы; bottom — ноги над блоком фразы', () => {
    const d = dev('iphone')
    expect(run(d, { anchor: 'top' }).base).toBe(0)
    const c = run(d, { anchor: 'center' })
    const mid = (c.cats.t + c.cats.b) / 2
    const phrase = zoneOf(c, 'phrase')
    const top = zoneOf(c, 'top')
    expect(Math.abs(mid - ((top.b + 8 + phrase.t - 8) / 2))).toBeLessThan(1)
    const b = run(d, { anchor: 'bottom' })
    expect(Math.abs(b.cats.b - (phrase.t - 8))).toBeLessThan(1)
  })

  it('scale — вокруг ног котов: ноги стоят на месте, голова выше; больше масштаб — выше облачко', () => {
    const d = dev('iphone')
    const a = run(d)
    const big = run(d, { scale: 1.4 })
    expect(big.cats.b).toBeCloseTo(a.cats.b, 5)
    expect(big.cats.t).toBeLessThan(a.cats.t)
    expect(big.bubbleBottom).toBeGreaterThan(a.bubbleBottom)
    expect(big.cats.r - big.cats.l).toBeCloseTo((a.cats.r - a.cats.l) * 1.4, 4)
  })

  it('x и y — сдвиг в долях кадра; выход за край и под кнопку даёт предупреждения', () => {
    const d = dev('iphone')
    const r = run(d, { x: 0.2, y: 0.3 })
    expect(r.tx).toBeCloseTo(0.2 * d.w, 0)
    expect(r.cats.b).toBeCloseTo(run(d).cats.b + 0.3 * d.h, 0)
    const zones = r.warnings.map(w => w.zone)
    expect(zones).toEqual(expect.arrayContaining(['edge', 'learn', 'nav']))
    const edge = run(d, { x: -0.5 })
    expect(edge.warnings.some(w => w.zone === 'edge' && /край/.test(w.text))).toBe(true)
  })

  it('облачко и иконка паузы привязаны к макушкам котов; линия пола — к масштабу', () => {
    const d = dev('android')
    const r = run(d)
    expect(r.bubbleBottom).toBeCloseTo(d.h - (r.cats.t - 112), 1)
    expect(r.pauseY).toBeLessThan(r.cats.t)
    expect(r.pauseY).toBeGreaterThan(d.h - r.bubbleBottom)
    // пол на слайде выше ног котов (линия пола — y 430 вьюбокса)
    expect(r.floorY).toBeLessThan(r.cats.b)
  })

  it('feedFrameVars — все CSS-переменные в px, кроме масштаба', () => {
    const v = feedFrameVars(run(dev('iphone'), { scale: 1.2 }))
    expect(v['--sf-k']).toBe('1.2')
    for (const k of ['--sf-tx', '--sf-ty', '--sf-ox', '--sf-oy', '--sf-bubble', '--pause-y', '--sf-floor-y', '--sf-hud-w']) expect(v[k]).toMatch(/^-?[\d.]+px$/)
  })

  it('dragFeedFrame: сдвиг пальцем в px → x, y; зажим −1…1; якорь и масштаб сохраняются', () => {
    const f = dragFeedFrame({ scale: 1.2, anchor: 'center' }, 39, -84.4, { w: 390, h: 844 })
    expect(f).toEqual({ scale: 1.2, x: 0.1, y: -0.1, anchor: 'center' })
    expect(dragFeedFrame(undefined, 5000, -5000, { w: 390, h: 844 })).toMatchObject({ x: 1, y: -1, scale: 1, anchor: 'bottom' })
    // перетащили на dx — сцена сместилась ровно на dx
    const d = dev('iphone')
    const a = run(d)
    const moved = run(d, dragFeedFrame(undefined, 30, 20, { w: d.w, h: d.h }))
    expect(moved.cats.l - a.cats.l).toBeCloseTo(30, 0)
    expect(moved.cats.t - a.cats.t).toBeCloseTo(20, 0)
  })

  it('зоны: HUD правее котов, кнопка выше нижней панели, фраза выше кнопки', () => {
    const z = id => feedZones({ w: 390, h: 844, navH: 74, safeTop: 47 }).find(x => x.id === id)
    expect(z('learn').b).toBe(844 - 74 - 20)
    expect(z('phrase').b).toBeLessThan(z('learn').t)
    expect(z('nav').t).toBe(770)
    expect(z('top').b).toBe(47 + 44)
    expect(z('hud').r).toBe(390 - 16)
  })
})
