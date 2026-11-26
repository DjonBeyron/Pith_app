import { describe, it, expect, vi } from 'vitest'
import { loopMover } from './laneConveyorMover.js'
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
