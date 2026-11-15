import { describe, it, expect } from 'vitest'
import { timeAt, yAt, zoneOf, fmt, ticks, ZONES, trackStep, lineOn, HOLD_MS } from './bossScale.js'
import { SPEED } from '../../player/modules/rotate-phone/wordLaneTimeline.js'

describe('шкала финала', () => {
  it('время и положение — обратные друг другу: скорость SPEED · speed % в секунду', () => {
    expect(yAt(2, 0.5)).toBeCloseTo(SPEED * 0.5 * 2, 6); expect(timeAt(yAt(3.3, 0.5), 0.5)).toBeCloseTo(3.3, 6); expect(timeAt(-5, 0.5)).toBe(0)
  })
  it('зоны: до 2 с крепко, до 4 с средне, дольше слабо; подпись «2,4 с»', () => {
    expect(ZONES.map(z => z.id)).toEqual(['fast', 'mid', 'slow']); expect([0, 1.99, 2, 3.9, 4, 9].map(zoneOf)).toEqual(['fast', 'fast', 'mid', 'mid', 'slow', 'slow'])
    expect(fmt(2.44)).toBe('2,4 с'); expect(fmt(0)).toBe('0,0 с'); expect(fmt(10)).toBe('10,0 с')
  })
  it('деления — целые секунды, что умещаются в поле', () => {
    const t = ticks(0.5, 100); expect(t[0]).toMatchObject({ t: 1 }); expect(t.at(-1).y).toBeLessThanOrEqual(100); expect(t).toHaveLength(Math.floor(100 / (SPEED * 0.5)))
  })
})

describe('какую пилюлю толкает линия', () => {
  const H = 700, el = { id: 'pill-1' }
  const pill = (o = {}) => ({ el, top: 0, bottom: 80, locked: false, failed: false, ...o })
  it('берёт появившуюся пилюлю, едет за её нижним краем, замирает на ответе и держится HOLD_MS', () => {
    let tr = trackStep(null, [pill({ top: -80, bottom: 5 })], H, 0); expect(tr).toMatchObject({ el, y: 5, done: false })
    tr = trackStep(tr, [pill({ top: 100, bottom: 180 })], H, 100); expect(tr.y).toBe(180)
    tr = trackStep(tr, [pill({ top: 200, bottom: 280, locked: true })], H, 200); expect(tr).toMatchObject({ done: true, y: 180, at: 200 }); expect(lineOn(tr, 200 + HOLD_MS - 1)).toBe(true); expect(lineOn(tr, 200 + HOLD_MS)).toBe(false)
  })
  it('ТА ЖЕ пилюля-узел для следующего слова (пул переиспользует элементы): линия берёт её заново, а не молчит', () => {
    let tr = trackStep(null, [pill({ top: 300, bottom: 380 })], H, 0)
    tr = trackStep(tr, [pill({ top: 320, bottom: 400, locked: true })], H, 50); expect(tr.done).toBe(true)
    tr = trackStep(tr, [pill({ top: -70, bottom: 10 })], H, 900); expect(tr).toMatchObject({ el, y: 10, done: false }) // узел сброшен (нет data-lock) и снова у верха
  })
  it('«не успел» (failed) и уход вниз закрывают пилюлю; ушедшую вниз и принятую заново не берёт', () => {
    let tr = trackStep(null, [pill()], H, 0)
    expect(trackStep(tr, [pill({ failed: true })], H, 10).done).toBe(true); expect(trackStep(tr, [pill({ top: H * 0.95, bottom: H * 1.05 })], H, 10).done).toBe(true)
    const done = trackStep(tr, [pill({ locked: true })], H, 10); expect(trackStep(done, [pill({ locked: true })], H, 20)).toBe(done)
    expect(trackStep(null, [], H, 0)).toBe(null)
  })
})
