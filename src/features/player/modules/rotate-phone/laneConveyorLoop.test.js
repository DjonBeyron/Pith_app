import { describe, it, expect, vi } from 'vitest'
import { loopMover, stepsFor, STEPS_HZ } from './laneConveyorMover.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// Слабое устройство (v3.3.380): узор едет сам — одна бесконечная анимация слоя, привод меняет только скорость
const fakeCol = () => {
  const col = { calls: [], style: { setProperty: vi.fn() } }
  col.animate = (frames, opts) => {
    const a = { frames, opts, rate: 1, state: 'running', timing: { duration: opts.duration }, cancelled: false, effect: { pseudoElement: '::before', setKeyframes: f => { a.frames = f }, updateTiming: t => Object.assign(a.timing, t) }, pause() { a.state = 'paused' }, play() { a.state = 'running' }, cancel() { a.cancelled = true } }
    Object.defineProperty(a, 'playbackRate', { get: () => a.rate, set: v => { a.rate = v; a.sets = (a.sets ?? 0) + 1 } })
    col.calls.push(a); return a
  }
  return col
}

describe('loopMover: бесконечный сдвиг слоя, 1 мс = 1 px', () => {
  it('создаёт одну бесконечную линейную анимацию ::before, стоит до первой скорости', () => {
    const col = fakeCol(), m = loopMover(col), a = col.calls[0]
    expect(a.opts).toMatchObject({ pseudoElement: '::before', iterations: Infinity, easing: 'linear' })
    expect(a.state).toBe('paused')
    m.setPeriod(400); expect(a.timing.duration).toBe(400); expect(a.frames[1].transform).toContain('400px')
    m.setRate(300); expect(a.rate).toBeCloseTo(0.3); expect(a.state).toBe('running') // 300 px/с = 0,3 px/мс
    m.setRate(305); expect(a.sets).toBe(1) // шаг меньше 4 % — не трогаем
    m.setRate(400); expect(a.rate).toBeCloseTo(0.4)
    m.setRate(0); expect(a.state).toBe('paused')
    m.setUp(true); expect(a.timing.direction).toBe('reverse')
    m.stop(); expect(a.cancelled).toBe(true)
  })
  it('смена направления (разворот в реверс) отражает время внутри периода: узор остаётся на месте и едет назад без скачка', () => {
    const col = fakeCol(), m = loopMover(col), a = col.calls[0]
    m.setPeriod(400); a.currentTime = 100 // видимое положение при normal: 100/400
    m.setUp(true); expect(a.timing.direction).toBe('reverse'); expect(a.currentTime).toBe(300) // при reverse положение 1 − 300/400 = 100/400 — то же
    m.setUp(true); expect(a.currentTime).toBe(300) // повторно то же направление — время не трогаем
    m.setUp(false); expect(a.currentTime).toBe(100)
  })
  it('нет animate — null (узор стоит)', () => { expect(loopMover({})).toBeNull() })
})

describe('привод на слабом устройстве (cheap)', () => {
  const field = () => {
    const cols = [0, 1, 2].map(() => ({ style: { setProperty: vi.fn() } }))
    const game = { hasAttribute: () => false }
    const root = { querySelectorAll: s => (s === '.wlLanes i' ? cols : []), querySelector: () => null, closest: s => (s === '.wl' ? game : null), addEventListener() {}, removeEventListener() {} }
    return { cols, root }
  }
  const make = (extra = {}) => {
    const f = field(), ms = f.cols.map(() => ({ setPeriod: vi.fn(), setRate: vi.fn(), setUp: vi.fn(), stop: vi.fn() }))
    const d = createConveyorDrive({ root: f.root, cheap: true, now: () => 0, log: () => {}, raf: () => 1, caf: () => {}, observe: () => () => {}, view: () => ({ h: 800, dpr: 2 }), onResize: () => () => {}, watchUp: () => () => {}, mover: () => { throw new Error('pseudoMover не нужен') }, loop: c => ms[f.cols.indexOf(c)], ...extra })
    return { d, f, ms }
  }
  it('пока дорожки едут, узор получает скорость > 0 и НИЧЕГО не пишет в стиль колонки (кроме периода и яркости)', () => {
    const { d, f, ms } = make()
    d.setArmed('111h')
    let t = 0
    for (let k = 0; k < 150; k++) d.frame(t += 16)
    expect(ms.every(m => m.setRate.mock.calls.some(c => c[0] > 50))).toBe(true)
    expect(ms[0].setPeriod).toHaveBeenCalledTimes(1)
    expect(f.cols.every(c => c.style.setProperty.mock.calls.every(x => x[0] !== '--run-y' && x[0] !== '--run-dash'))).toBe(true)
  })
  it('пауза не-гонки останавливает узор, dispose снимает анимации', () => {
    const { d, ms } = make()
    d.setPaused(true)
    expect(ms.every(m => m.setRate.mock.calls.at(-1)[0] === 0)).toBe(true)
    d.dispose(); expect(ms.every(m => m.stop.mock.calls.length === 1)).toBe(true)
  })
  it('reduced-motion (still) — «двигатель» не создаётся: узор стоит', () => {
    const { d, ms } = make({ still: true })
    d.setArmed('111h'); let t = 0
    for (let k = 0; k < 60; k++) d.frame(t += 16)
    expect(ms.every(m => m.setRate.mock.calls.length === 0)).toBe(true)
  })
})

describe('«Реже» (v3.3.387): узор меняет положение дискретными шагами на том же слое', () => {
  it('stepsFor: ≈ STEPS_HZ смен в секунду, число шагов делит период в пикселях устройства (целый пиксель, без шва)', () => {
    for (const [per, v, dpr] of [[420, 300, 2], [420, 900, 2], [380.4, 250, 2.625], [800, 120, 3]]) {
      const n = stepsFor(per, v, dpr), pd = Math.round(per * dpr)
      expect(pd % n).toBe(0)
      const hz = (n * v) / per
      expect(hz).toBeGreaterThan(STEPS_HZ * 0.4); expect(hz).toBeLessThan(STEPS_HZ * 2.5)
    }
  })
  it('stepsFor: период — простое число пикселей — шаг дробный, но не 300 смен в секунду', () => { const n = stepsFor(97, 300, 1); expect((n * 300) / 97).toBeLessThan(STEPS_HZ * 2.5) })
  it('loopMover({ steps }): easing steps(n, end) после первой скорости, смена скорости пересчитывает n; без steps — linear', () => {
    const col = fakeCol(), m = loopMover(col, { steps: true }), a = col.calls[0]
    m.setPeriod(420, 2); m.setRate(300)
    expect(a.timing.easing).toMatch(/^steps\(\d+, end\)$/)
    const n1 = Number(a.timing.easing.match(/\d+/)[0]); expect(840 % n1).toBe(0)
    m.setRate(900)
    expect(Number(a.timing.easing.match(/\d+/)[0])).toBeGreaterThan(n1 / 3.5) // быстрее — шаг в пикселях крупнее, смен в секунду по-прежнему ≈ 10
    const plain = fakeCol(), p = loopMover(plain); p.setPeriod(420, 2); p.setRate(300)
    expect(plain.calls[0].timing.easing).toBeUndefined()
  })
  it('«Реже»: обратный проход (reverse) и бонус-круг (скорость ×3) не пересоздают анимацию — только направление, playbackRate и n', () => {
    const col = fakeCol(), m = loopMover(col, { steps: true }), a = col.calls[0]
    m.setPeriod(420, 2); m.setRate(200); m.setUp(true)
    expect(a.timing.direction).toBe('reverse'); expect(a.timing.easing).toMatch(/^steps\(/)
    const n1 = Number(a.timing.easing.match(/\d+/)[0]); m.setRate(600) // бонус-круг
    expect(col.calls).toHaveLength(1); expect(a.rate).toBeCloseTo(0.6); expect(840 % Number(a.timing.easing.match(/\d+/)[0])).toBe(0)
    expect(n1).toBeGreaterThan(0)
  })
  it('привод в режиме steps: ни rAF сверх общего кадра, ни записи --run-y / --run-dash в стиль колонки', () => {
    const cols = [0, 1, 2].map(() => ({ style: { setProperty: vi.fn() } }))
    const game = { hasAttribute: () => false }
    const root = { querySelectorAll: s => (s === '.wlLanes i' ? cols : []), querySelector: () => null, closest: s => (s === '.wl' ? game : null), addEventListener() {}, removeEventListener() {} }
    const loops = []; const raf = vi.fn(() => 1)
    const d = createConveyorDrive({ root, cheap: true, steps: true, now: () => 0, log: () => {}, raf, caf: () => {}, observe: () => () => {}, view: () => ({ h: 800, dpr: 2 }), onResize: () => () => {}, watchUp: () => () => {}, loop: (c, o) => { const m = { opts: o, setPeriod: vi.fn(), setRate: vi.fn(), setUp: vi.fn(), stop: vi.fn() }; loops.push(m); return m } })
    expect(loops).toHaveLength(3); expect(loops.every(m => m.opts.steps === true)).toBe(true)
    d.setArmed('111h'); let t = 0
    for (let k = 0; k < 120; k++) d.frame(t += 16)
    expect(loops[0].setPeriod).toHaveBeenCalledWith(expect.any(Number), 2)
    expect(cols.every(c => c.style.setProperty.mock.calls.every(x => x[0] !== '--run-y' && x[0] !== '--run-dash'))).toBe(true)
    expect(raf.mock.calls.length).toBeLessThanOrEqual(121) // не больше одного запроса на кадр общего цикла
    d.dispose()
  })
})
