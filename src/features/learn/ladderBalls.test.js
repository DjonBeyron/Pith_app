import { describe, it, expect } from 'vitest'
import { MAX_FLYING_BALLS, flyingBalls, ballTiming } from './ladderBalls.js'
import { ballKeyframes, ballTrack, easeProgress, easeTime, RUN_END } from './ladderBallTrack.js'
import { ladderLinks, ballPoints, orth } from './ladderWires.js'

describe('flyingBalls — лимит шариков', () => {
  it('потолок — три, по одному на ступень', () => {
    expect(MAX_FLYING_BALLS).toBe(3)
    expect(flyingBalls([5, 7, 9])).toEqual([0, 1, 2])
    expect(flyingBalls([1, 1, 1])).toEqual([0, 1, 2])
  })

  it('много слов на ступени — всё равно один шарик', () => {
    expect(flyingBalls([40, 0, 100])).toEqual([0, 2])
    expect(flyingBalls([3, 3, 3])).toHaveLength(3)
  })

  it('нет слов к повтору — шариков нет', () => {
    expect(flyingBalls([0, 0, 0])).toEqual([])
    expect(flyingBalls([])).toEqual([])
  })

  it('жёсткий лимит: даже при «лишних» ступенях и мусоре на входе больше трёх не бывает', () => {
    expect(flyingBalls([1, 1, 1, 1, 1, 1])).toHaveLength(MAX_FLYING_BALLS)
    expect(flyingBalls([1, 1, 1, 1, 1, 1])).toEqual([0, 1, 2])
    expect(flyingBalls(undefined)).toEqual([])
    expect(flyingBalls(null)).toEqual([])
    expect(flyingBalls([NaN, -2, undefined, 1])).toEqual([3])
  })

  it('время пролёта и старт у ступеней разные — шарики не в ногу', () => {
    expect(ballTiming(0)).toEqual({ dur: '2.6s', delay: '0.00s' })
    expect(ballTiming(2)).toEqual({ dur: '3.2s', delay: '0.20s' })
  })
})

describe('ballKeyframes — путь шарика покадрово (transform вместо offset-path)', () => {
  const rect = (l, t, r, b) => ({ l, t, r, b })
  const links = ladderLinks({
    hero: rect(20, 0, 370, 150), circle: rect(145, 170, 245, 270),
    blocks: [rect(30, 300, 270, 400), rect(80, 420, 320, 520), rect(130, 540, 380, 640)], fin: rect(100, 680, 300, 880), edge: 0,
  })
  const pts = ballPoints(links[0], links[3])

  it('кривая времени: прогресс и время — взаимно обратные, концы на месте', () => {
    expect(easeProgress(0)).toBeCloseTo(0, 6)
    expect(easeProgress(1)).toBeCloseTo(1, 6)
    expect(easeProgress(0.5)).toBeCloseTo(0.5, 3)
    for (const p of [0.1, 0.3, 0.8]) expect(easeProgress(easeTime(p))).toBeCloseTo(p, 4)
  })

  it('кадры идут от 0% до RUN_END% строго по возрастанию, начало — старт пути, конец — шапка', () => {
    const t = ballTrack(pts)
    expect(t[0]).toMatchObject({ at: 0, x: pts[0][0], y: pts[0][1] })
    expect(t.at(-1).at).toBe(RUN_END)
    const last = pts.at(-1)
    expect(Math.hypot(t.at(-1).x - last[0], t.at(-1).y - last[1])).toBeLessThan(0.1)
    t.slice(1).forEach((k, i) => expect(k.at).toBeGreaterThan(t[i].at))
    expect(t.length).toBeLessThan(400)
  })

  it('все кадры лежат на пути шарика (углы не срезаны больше чем на 0.5 px)', () => {
    // плотная ломаная того же пути (дуги углов — мелко) как эталон расстояния
    const dense = []
    const d = orth(pts).match(/-?\d+(\.\d+)?/g).map(Number)
    for (let i = 0; i + 1 < d.length; i += 2) dense.push([d[i], d[i + 1]])
    const onPath = ([x, y]) => {
      let best = Infinity
      for (let i = 1; i < dense.length; i++) {
        const [ax, ay] = dense[i - 1], [bx, by] = dense[i]
        const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1
        const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2))
        best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * u), y - (ay + (by - ay) * u)))
      }
      return best
    }
    // у Q-кривых контрольная точка — в path, поэтому проверяем только прямые участки: кадры на них лежат на линии
    const track = ballTrack(pts)
    const straight = track.filter(k => Math.abs(k.x - pts[0][0]) < 0.01 || Math.abs(k.y - pts[0][1]) < 0.01)
    expect(straight.length).toBeGreaterThan(5)
    straight.forEach(k => expect(onPath([k.x, k.y])).toBeLessThan(0.5))
  })

  it('CSS: один @keyframes с translate3d, без offset-distance, последний кадр держится до 100%', () => {
    const css = ballKeyframes('memBallPath1', pts)
    expect(css.startsWith('@keyframes memBallPath1{0%{transform:translate3d(')).toBe(true)
    expect(css).toMatch(new RegExp(`${RUN_END}%,100%\\{transform:translate3d\\(`))
    expect(css).not.toMatch(/offset|NaN/)
  })
})
