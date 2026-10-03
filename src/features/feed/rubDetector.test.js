import { describe, it, expect } from 'vitest'
import { createRubDetector, STROKE, NEED, DRIFT, IDLE_MS } from './rubDetector.js'

// Прогнать путь по x (y держим около нуля) шагами по 4 px и 16 мс; → итог последнего шага
function run(det, xs, { y = 0, t0 = 0, step = 4 } = {}) {
  det.start(xs[0], y, t0)
  let t = t0
  let res = { progress: 0, done: false }
  let x = xs[0]
  for (const target of xs.slice(1)) {
    while (Math.abs(target - x) > 0.001) {
      x += Math.sign(target - x) * Math.min(step, Math.abs(target - x))
      t += 16
      res = det.move(x, y, t)
      if (res.done) return res
    }
  }
  return res
}

describe('жест «потереть»', () => {
  it('три уверенных штриха туда-сюда — готово', () => {
    expect(NEED).toBe(3)
    const res = run(createRubDetector(), [100, 100 + STROKE + 6, 100, 100 + STROKE + 6])
    expect(res.done).toBe(true)
    expect(res.progress).toBe(1)
  })

  it('то же в другую сторону — готово', () => {
    expect(run(createRubDetector(), [200, 200 - STROKE - 6, 200, 200 - STROKE - 6]).done).toBe(true)
  })

  it('один свайп в одну сторону — не трение', () => {
    const res = run(createRubDetector(), [20, 320])
    expect(res.done).toBe(false)
    expect(res.progress).toBeLessThan(0.5)
  })

  it('два штриха — ещё не готово, прогресс растёт', () => {
    const res = run(createRubDetector(), [100, 100 + STROKE + 6, 100])
    expect(res.done).toBe(false)
    expect(res.progress).toBeGreaterThan(0.5)
    expect(res.progress).toBeLessThan(1)
  })

  it('дрожь пальца и мелкие подёргивания — не трение', () => {
    const wiggle = [100]
    for (let i = 0; i < 30; i++) wiggle.push(100 + (i % 2 ? -12 : 12))
    expect(run(createRubDetector(), wiggle).done).toBe(false)
  })

  it('короткий разворот посреди жеста обнуляет счёт', () => {
    const det = createRubDetector()
    const res = run(det, [100, 100 + STROKE + 6, 100, 112, 100, 112])
    expect(res.done).toBe(false)
  })

  it('уход по вертикали (пролистывание ленты) отменяет жест', () => {
    const det = createRubDetector()
    det.start(100, 0, 0)
    det.move(100 + STROKE + 6, 10, 16)
    expect(det.move(100, DRIFT + 10, 32).done).toBe(false)
    // и дальше жест мёртв, пока не начат заново
    expect(run2(det)).toBe(false)
    function run2(d) {
      let r
      for (let i = 0; i < 40; i++) r = d.move(100 + (i % 2 ? 40 : 0), DRIFT + 10, 48 + i * 16)
      return r.done
    }
  })

  it('пауза дольше порога начинает счёт заново', () => {
    const det = createRubDetector()
    det.start(100, 0, 0)
    let t = 0
    for (const x of [140, 100]) det.move(x, 0, (t += 16))
    // палец замер
    t += IDLE_MS + 50
    const res = det.move(140, 0, t)
    expect(res.done).toBe(false)
    expect(res.progress).toBeLessThan(0.34)
  })

  it('без start ничего не происходит', () => {
    expect(createRubDetector().move(10, 10, 0)).toEqual({ progress: 0, done: false })
  })
})
