import { describe, it, expect } from 'vitest'
import { createConveyorDrive, waveLocal, NO_WAVE, MAX_DT } from './laneConveyorDrive.js'
import { IGNITE_MS, ACCEL_MS, DECEL_MS, HOLD_MS, REST_A, RUN_A, RUN_SPEED, PERIOD } from './wordLaneConveyor.js'

// Привод конвейера на подставном DOM: колонки .wlLanes i и пилюли [data-held] с data-lane; время и rAF — вручную
function setup(opts = {}) {
  const cols = [0, 1, 2].map(() => ({ props: {}, style: { setProperty(k, v) { this.owner.props[k] = v } } }))
  cols.forEach(c => { c.style.owner = c })
  let held = [], notify = () => {}, queue = [], cancelled = 0, t = 1000
  const root = { querySelectorAll: sel => (sel === '.wlLanes i' ? cols : held.map(lane => ({ dataset: { lane: String(lane) } }))) }
  const drive = createConveyorDrive({
    root, now: () => t, raf: f => { queue.push(f); return queue.length }, caf: () => { cancelled += 1; queue = [] },
    observe: (el, fn) => { notify = fn; return () => { notify = () => {} } }, ...opts,
  })
  const h = {
    cols, drive, setHeld(lanes) { held = lanes; notify() },
    frames(ms, step = 1000 / 60) { for (let el = 0; el < ms - 1e-6 && queue.length; el += step) { t += step; const f = queue.shift(); f(t) } },
    pending: () => queue.length, cancelled: () => cancelled,
    v: (i, name) => cols[i].props[name],
  }
  return h
}
const A = lane => Number(lane) // читабельность

describe('привод конвейера: запись в колонки и жизненный цикл rAF', () => {
  it('ничего не взведено — один кадр записывает покой, и цикл засыпает (rAF не крутится вхолостую)', () => {
    const h = setup()
    h.drive.setArmed('000')
    h.frames(100)
    expect(h.pending()).toBe(0)
    expect(h.drive.state().phases).toEqual(['idle', 'idle', 'idle'])
    expect(Number(h.v(0, '--run-a'))).toBeCloseTo(REST_A, 3)
    expect(h.v(0, '--run-y')).toBe('0.00dvh')
  })
  it('взвели «101»: ехать начинают только эти дорожки, средняя в покое (яркость покоя, не движется)', () => {
    const h = setup()
    h.drive.setArmed('101')
    h.frames(IGNITE_MS + ACCEL_MS + 500)
    expect(h.drive.state().phases).toEqual(['run', 'idle', 'run'])
    expect(Number(h.v(0, '--run-a'))).toBeCloseTo(RUN_A, 2)
    expect(Number(h.v(1, '--run-a'))).toBeCloseTo(REST_A, 3)
    expect(h.v(1, '--run-y')).toBe('0.00dvh')
    expect(h.v(0, '--run-y')).toMatch(/dvh$/)
  })
  it('зажигание: --run-w бежит по пунктиру, затем волны нет (999dvh); штрихи стоят (y = 0)', () => {
    const h = setup()
    h.drive.setArmed('100')
    h.frames(50)
    const w1 = parseFloat(h.v(0, '--run-w'))
    h.frames(120)
    const w2 = parseFloat(h.v(0, '--run-w'))
    expect(w2).toBeGreaterThan(w1)
    expect(h.v(0, '--run-y')).toBe('0.00dvh')
    h.frames(IGNITE_MS + 200)
    expect(h.v(0, '--run-w')).toBe(NO_WAVE)
  })
  it('пилюли на дорожке (data-held + data-lane) держат ход и без команды; улетели — торможение, потом цикл засыпает', () => {
    const h = setup()
    h.drive.setArmed('010')
    h.setHeld([1])
    h.frames(2000)
    h.drive.setArmed('000') // стадия кончилась, пилюли ещё взлетают
    h.frames(1500)
    expect(h.drive.state().phases[1]).toBe('run')
    h.setHeld([])
    h.frames(300)
    expect(h.drive.state().phases[1]).toBe('decel')
    h.frames(DECEL_MS + 200)
    expect(h.drive.state().phases).toEqual(['idle', 'idle', 'idle'])
    expect(h.drive.state().running).toBe(false)
    expect(h.pending()).toBe(0)
    expect(Number(h.v(1, '--run-a'))).toBeCloseTo(REST_A, 3)
  })
  it('пилюля появилась на спящем приводе — наблюдатель будит цикл, дорожка зажигается; соседние не трогаются', () => {
    const h = setup()
    h.setHeld([2])
    expect(h.drive.state().pills).toEqual([0, 0, 1])
    h.frames(100)
    expect(h.drive.state().phases).toEqual(['idle', 'idle', 'ignite'])
  })
  it('независимость: едет одна, добавилась вторая, первая остановилась — вторая едет дальше', () => {
    const h = setup()
    h.setHeld([0])
    h.frames(1500)
    h.setHeld([0, 1])
    h.frames(1500)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'idle'])
    h.setHeld([1])
    h.frames(HOLD_MS + 300)
    expect(h.drive.state().phases).toEqual(['decel', 'run', 'idle'])
    h.frames(DECEL_MS + 100)
    expect(h.drive.state().phases).toEqual(['idle', 'run', 'idle'])
  })
  it('пауза игры: цикл снят, состояние стоит; снятие паузы продолжает без скачка (шаг за кадр ограничен MAX_DT)', () => {
    const h = setup()
    h.setHeld([0])
    h.frames(1500)
    const y = h.v(0, '--run-y')
    h.drive.setPaused(true)
    expect(h.pending()).toBe(0)
    expect(h.cancelled()).toBeGreaterThan(0)
    h.frames(1000)
    expect(h.v(0, '--run-y')).toBe(y)
    h.drive.setPaused(false)
    expect(h.pending()).toBe(1)
    h.frames(1000 / 60)
    expect(h.drive.state().phases[0]).toBe('run')
    expect(MAX_DT).toBeLessThanOrEqual(64)
  })
  it('still (слабое устройство, reduced-motion): пунктир не двигается и без волны, но яркость работает', () => {
    const h = setup({ still: true })
    h.setHeld([0])
    h.frames(IGNITE_MS + ACCEL_MS + 400)
    expect(h.v(0, '--run-y')).toBe('0.00dvh')
    expect(h.v(0, '--run-w')).toBe(NO_WAVE)
    expect(Number(h.v(0, '--run-a'))).toBeCloseTo(RUN_A, 2)
  })
  it('запись только при изменении значения', () => {
    const h = setup()
    let writes = 0
    h.cols[0].style.setProperty = function setProperty(k, v) { writes += 1; this.owner.props[k] = v }
    h.setHeld([0])
    h.frames(IGNITE_MS + ACCEL_MS + 2000)
    const before = writes
    h.frames(500)
    // на рабочей скорости пишется один --run-y за кадр, яркость и волна стоят
    expect(writes - before).toBeLessThanOrEqual(31)
  })
  it('dispose снимает цикл и наблюдателя', () => {
    const h = setup()
    h.setHeld([0])
    h.drive.dispose()
    expect(h.pending()).toBe(0)
  })
})

describe('waveLocal: позиция волны в координатах слоя', () => {
  it('волна идёт сверху вниз (растёт), учитывает высоту слоя над колонкой и сдвиг y', () => {
    expect(parseFloat(waveLocal(0, 0))).toBeLessThan(parseFloat(waveLocal(0.5, 0)))
    expect(parseFloat(waveLocal(1, 0))).toBeGreaterThan(100)
    expect(parseFloat(waveLocal(0.5, 3))).toBeCloseTo(parseFloat(waveLocal(0.5, 0)) - 3, 2)
    expect(parseFloat(waveLocal(0, 0))).toBeLessThan(PERIOD)
  })
  it('рабочая скорость = SPEED (dvh/с)', () => {
    expect(A(RUN_SPEED)).toBe(26)
  })
})
