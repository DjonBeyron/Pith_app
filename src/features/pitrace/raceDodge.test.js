import { describe, it, expect } from 'vitest'
import { createDodge, dodgeOf, laneX, leadOf, HEAD_TOP, LEAD_MIN, LEAD_MAX } from './raceDodge.js'
import { LANE_X, PILL_H, PILL_W } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Модель «Пит уворачивается»: слежение под дорожкой, уворот перед макушкой, без уворота при зачёте, возврат после прохода
const pill = (o = {}) => ({ id: 'a', lane: 1, y: 20, speed: 1, state: 'fly', ...o })
const dodgeY = (speed = 1) => HEAD_TOP - leadOf(speed) - PILL_H / 2 // центр пилюли, при котором её низ на пороге уворота

describe('raceDodge — порог и место', () => {
  it('порог по y зависит от скорости, но в пределах 8–14 %', () => {
    expect(leadOf(1)).toBe(LEAD_MIN)
    expect(leadOf(1.5)).toBeCloseTo(11.7, 1)
    expect(leadOf(3)).toBe(LEAD_MAX)
  })
  it('голова под дорожкой: середина — центр, крайние — ближе к середине, чтобы голова была в кадре', () => {
    expect(laneX(1)).toBe(50)
    expect(laneX(0)).toBe(27)
    expect(laneX(2)).toBe(73)
    expect(laneX(0, 28)).toBeCloseTo(LANE_X[0], 5) // голова поуже (планшет) — точно под центром дорожки
  })
  it('от крайней дорожки отскакивает к середине, и пилюля голову не задевает', () => {
    const l = dodgeOf(pill({ lane: 0 }))
    expect(l.dir).toBe(1)
    expect(Math.abs(l.x - LANE_X[0])).toBeGreaterThanOrEqual(PILL_W / 2 + 20 - 1e-9)
    expect(dodgeOf(pill({ lane: 2 })).dir).toBe(-1)
  })
  it('у средней дорожки — в сторону без другой пилюли внизу, иначе попеременно', () => {
    const p = pill({ lane: 1, y: 60 })
    expect(dodgeOf(p, [p, pill({ id: 'b', lane: 0, y: 70 })]).dir).toBe(1)
    expect(dodgeOf(p, [p, pill({ id: 'b', lane: 2, y: 70 })]).dir).toBe(-1)
    expect(dodgeOf(p, [p], { prev: 1 }).dir).toBe(-1)
    expect(dodgeOf(p, [p], { prev: -1 }).dir).toBe(1)
  })
})

describe('raceDodge — шаги', () => {
  it('Пит переезжает под дорожку текущей пилюли; пилюль нет — стоит где стоял', () => {
    const m = createDodge({ x0: 33 })
    expect(m.step([], 0).x).toBe(33)
    const s = m.step([pill({ lane: 2 })], 16)
    expect(s.x).toBe(73)
    expect(s.events).toEqual([expect.objectContaining({ type: 'track', lane: 2, x: 73 })])
    expect(m.step([], 32).x).toBe(73)
  })
  it('уворот — когда низ пилюли подошёл к макушке, один раз; возврат — когда пилюля прошла', () => {
    const m = createDodge()
    expect(m.step([pill({ y: dodgeY() - 0.5 })], 0).dodge).toBeNull()
    const s = m.step([pill({ y: dodgeY() + 0.1 })], 16)
    expect(s.dodge).toMatchObject({ id: 'a', at: 16 })
    expect(s.events.filter(e => e.type === 'dodge')).toHaveLength(1)
    expect(m.step([pill({ y: 90, state: 'failed' })], 600).events).toEqual([]) // «не успел»: серая доезжает вниз — Пит ещё в стороне
    const back = m.step([pill({ y: 100 + PILL_H / 2, state: 'failed' })], 900)
    expect(back.dodge).toBeNull()
    expect(back.events).toEqual([expect.objectContaining({ type: 'back', x: 50 })])
  })
  it('быстрая пилюля — уворот раньше (порог больше)', () => {
    const slow = createDodge(), fast = createDodge()
    const y = dodgeY(1.6) + 0.1
    expect(slow.step([pill({ y, speed: 1 })], 0).dodge).toBeNull()
    expect(fast.step([pill({ y, speed: 1.6 })], 0).dodge).not.toBeNull()
  })
  it('зачёт (пилюля засчитана и взлетает) — уворота нет, Пит остаётся под ней', () => {
    const m = createDodge()
    m.step([pill({ lane: 0, y: 40 })], 0)
    const s = m.step([pill({ lane: 0, y: 75, state: 'lock' })], 500)
    expect(s.dodge).toBeNull()
    expect(s.x).toBe(27)
    expect(m.step([pill({ lane: 0, y: 75, state: 'won' })], 700).events).toEqual([])
  })
  it('засчитали уже после уворота — Пит возвращается', () => {
    const m = createDodge()
    m.step([pill({ y: dodgeY() + 1 })], 0)
    expect(m.step([pill({ y: dodgeY() + 3, state: 'lock' })], 100).events.map(e => e.type)).toEqual(['back'])
  })
  it('следим за самой нижней живой; после прохода — под дорожку следующей', () => {
    const m = createDodge()
    const a = pill({ id: 'a', lane: 0, y: dodgeY() + 1 }), b = pill({ id: 'b', lane: 2, y: 30 })
    const s = m.step([a, b], 0)
    expect(s.x).toBe(27)
    expect(s.dodge.dir).toBe(1)
    const s2 = m.step([b], 500) // a ушла из списка
    expect(s2.events.map(e => e.type)).toEqual(['back', 'track'])
    expect(s2.x).toBe(73)
  })
  it('need — голова должна торчать, пока пилюля подходит и пока Пит в стороне', () => {
    const m = createDodge()
    expect(m.step([pill({ y: 10 })], 0).need).toBe(false)
    expect(m.step([pill({ y: 50 })], 10).need).toBe(true)
    expect(m.step([pill({ y: dodgeY() + 1 })], 20).need).toBe(true)
  })
  it('stop: в стороне — вернуть под базу', () => {
    const m = createDodge()
    expect(m.stop()).toBeNull()
    m.step([pill({ y: dodgeY() + 1 })], 0)
    expect(m.stop()).toBe(50)
  })
})
