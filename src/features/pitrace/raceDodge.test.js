import { describe, it, expect } from 'vitest'
import { createDodge, dodgeOf, jumpTo, laneX, leadOf, HEAD_TOP, LEAD_MIN, LEAD_MAX, DIVE_MS, JUMP_MS, CENTER, ASIDE } from './raceDodge.js'
import { LANE_X, PILL_H, PILL_W } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Модель «Пит ныряет и уворачивается»: цель — дорожка СЛЕДУЮЩЕЙ пилюли; зачёт → нырок, «не успел» → прыжок, та же дорожка → в сторону и обратно, последняя → центр; по x не скользит
const pill = (o = {}) => ({ id: 'a', rep: 0, lane: 1, y: 20, speed: 1, state: 'fly', ...o })
const dodgeY = (speed = 1) => HEAD_TOP - leadOf(speed) - PILL_H / 2 // центр пилюли, при котором её низ на пороге прыжка
const CLEAR = PILL_W / 2 + 20

describe('raceDodge — порог и место', () => {
  it('порог по y зависит от скорости, но в пределах 8–14 %', () => {
    expect(leadOf(1)).toBe(LEAD_MIN)
    expect(leadOf(1.5)).toBeCloseTo(11.7, 1)
    expect(leadOf(3)).toBe(LEAD_MAX)
  })
  it('голова под дорожкой: середина — центр, крайние — ближе к середине, чтобы голова была в кадре', () => {
    expect([laneX(0), laneX(1), laneX(2)]).toEqual([27, 50, 73])
    expect(laneX(0, 28)).toBeCloseTo(LANE_X[0], 5)
  })
  it('в сторону: от крайней — к середине, пилюля голову не задевает; у средней — попеременно', () => {
    const l = dodgeOf(pill({ lane: 0 }))
    expect(l.dir).toBe(1)
    expect(Math.abs(l.x - LANE_X[0])).toBeGreaterThanOrEqual(CLEAR - 1e-9)
    expect(dodgeOf(pill({ lane: 2 })).dir).toBe(-1)
    expect(dodgeOf(pill(), [], { prev: 1 }).dir).toBe(-1)
  })
  it('прыжок на дорожку: под ней, а если голова задела бы пилюлю — дальше в ту же сторону', () => {
    expect(jumpTo(pill({ lane: 0 }), 1)).toEqual({ dir: 1, x: 50 })
    expect(jumpTo(pill({ lane: 2 }), 0)).toEqual({ dir: -1, x: 27 })
    const j = jumpTo(pill({ lane: 1 }), 0)
    expect(j.dir).toBe(-1)
    expect(50 - j.x).toBeGreaterThanOrEqual(CLEAR - 1e-9)
  })
})

describe('raceDodge — хореография', () => {
  it('старт: нырок под дорожку первой пилюли', () => {
    const m = createDodge({ lanes: [2, 0, 1] })
    expect(m.start()).toMatchObject({ kind: 'dive', from: CENTER, toLane: 2, x: 73, waitMs: DIVE_MS, why: 'старт' })
  })
  it('зачёт → нырок под дорожку следующей; на той же дорожке — нырок на месте', () => {
    const m = createDodge({ lanes: [2, 0, 0] })
    m.start()
    expect(m.claim(0)).toMatchObject({ kind: 'dive', from: 2, toLane: 0, x: 27, why: 'зачёт' })
    expect(m.claim(1)).toMatchObject({ kind: 'dive', from: 0, toLane: 0, x: 27 })
  })
  it('пилюля дошла до Пита → прыжок на дорожку следующей (один раз), fail после него — ничего', () => {
    const m = createDodge({ lanes: [0, 2, 1] })
    m.start()
    expect(m.step([pill({ lane: 0, y: dodgeY() - 0.5 })]).plans).toEqual([])
    const s = m.step([pill({ lane: 0, y: dodgeY() + 0.1 })])
    expect(s.plans).toEqual([expect.objectContaining({ kind: 'jump', from: 0, toLane: 2, x: 73, dir: 1, waitMs: JUMP_MS, why: 'не успел' })])
    expect(m.step([pill({ lane: 0, y: dodgeY() + 3 })]).plans).toEqual([])
    expect(m.fail(0).kind).toBeNull()
    expect(m.x).toBe(73)
  })
  it('ответ в последний момент (зачёт после начала прыжка): прыжок не отменяется, Пит уже под следующей', () => {
    const m = createDodge({ lanes: [0, 1] })
    m.start()
    m.step([pill({ lane: 0, y: dodgeY() + 1 })])
    expect(m.claim(0)).toMatchObject({ kind: null, toLane: 1, x: 50 })
  })
  it('без прыжка (пилюля не дошла до головы) «не успел» — нырок к следующей', () => {
    const m = createDodge({ lanes: [0, 1] })
    m.start()
    expect(m.fail(0)).toMatchObject({ kind: 'dive', toLane: 1, why: 'не успел' })
  })
  it('следующая на той же дорожке: прыжок в сторону, обратно — когда пилюля прошла (с учётом времени прыжка)', () => {
    const m = createDodge({ lanes: [1, 1] })
    m.start()
    const out = m.step([pill({ y: dodgeY() + 1 })]).plans[0]
    expect(out).toMatchObject({ kind: 'jump', toLane: ASIDE, same: true })
    expect(Math.abs(out.x - 50)).toBeGreaterThanOrEqual(CLEAR - 1e-9)
    expect(m.fail(0).kind).toBeNull()
    expect(m.step([pill({ y: 96, state: 'failed' })]).plans).toEqual([])
    expect(m.backIn([pill({ y: 96, state: 'failed' })])).toBeGreaterThan(JUMP_MS)
    const back = m.step([pill({ y: 106, state: 'failed' })]).plans[0]
    expect(back).toMatchObject({ kind: 'jump', from: ASIDE, toLane: 1, x: 50, why: 'пилюля прошла' })
    expect(back.dir).toBe(-out.dir)
    expect(m.backIn([])).toBe(0)
  })
  it('в стороне, а слово засчитали — прыжок обратно сразу', () => {
    const m = createDodge({ lanes: [1, 1] })
    m.start()
    m.step([pill({ y: dodgeY() + 1 })])
    expect(m.claim(0)).toMatchObject({ kind: 'jump', toLane: 1, x: 50, why: 'зачёт' })
  })
  it('последняя пилюля: зачёт → нырок в центр; «не успел» → в сторону, затем нырок в центр', () => {
    const a = createDodge({ lanes: [0] })
    a.start()
    expect(a.claim(0)).toMatchObject({ kind: 'dive', toLane: CENTER, x: 50 })
    expect(a.end().kind).toBeNull()
    const b = createDodge({ lanes: [0] })
    b.start()
    expect(b.step([pill({ lane: 0, y: dodgeY() + 1 })]).plans[0]).toMatchObject({ kind: 'jump', toLane: ASIDE })
    expect(b.step([]).plans[0]).toMatchObject({ kind: 'dive', toLane: CENTER, x: 50 })
  })
  it('конец ступени: не в центре — нырок в центр (и из стороны тоже)', () => {
    const m = createDodge({ lanes: [1, 1] })
    m.start()
    m.step([pill({ y: dodgeY() + 1 })])
    expect(m.end()).toMatchObject({ kind: 'dive', from: ASIDE, toLane: CENTER, why: 'конец ступени' })
  })
  it('засчитанная пилюля (взлетает) не живая — прыжка нет; need — пока пилюля подходит или Пит в стороне', () => {
    const m = createDodge({ lanes: [0, 1] })
    m.start()
    expect(m.step([pill({ lane: 0, y: 75, state: 'lock' })]).plans).toEqual([])
    expect(m.step([pill({ y: 10 })]).need).toBe(false)
    expect(m.step([pill({ y: 50 })]).need).toBe(true)
  })
  it('по x не скользит: любой переход — нырок или прыжок', () => {
    const m = createDodge({ lanes: [0, 2, 1, 1] })
    const plans = [m.start(), m.claim(0), ...m.step([pill({ rep: 1, lane: 2, y: dodgeY() + 1 })]).plans, m.fail(1), ...m.step([pill({ rep: 2, id: 'c', lane: 1, y: dodgeY() + 1 })]).plans, ...m.step([]).plans, m.claim(3)]
    expect(plans.filter(p => p.kind).map(p => p.kind)).toEqual(['dive', 'dive', 'jump', 'jump', 'jump', 'dive'])
  })
})
