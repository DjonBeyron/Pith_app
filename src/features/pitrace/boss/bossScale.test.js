import { describe, it, expect } from 'vitest'
import { timeAt, yAt, zoneOf, fmt, ticks, ZONES } from './bossScale.js'
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
