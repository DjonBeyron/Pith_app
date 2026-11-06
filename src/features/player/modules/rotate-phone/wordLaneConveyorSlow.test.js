import { describe, it, expect } from 'vitest'
import { createLane, stepLane, laneLook, SLOW_RATIO, SHIFT_MS, IGNITE_MS, ACCEL_MS, DECEL_MS, RUN_SPEED, RUN_A, REST_A, RACE_PERIOD } from './wordLaneConveyor.js'
import { raceSlowLanes, SLOW_CHAR } from './wordLaneConveyorStart.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// «Встряхни память» (v3.3.129): между этапами конвейер не встаёт, а едет медленно; полная остановка — пауза, итог, выход
const STEP = 1000 / 60
const RUN = { armed: true, keep: true, slow: true }
const SLOW = { armed: false, slow: true }
const STOP = { armed: false }
function trace(L, ms, inp, out = []) { for (let t = 0; t < ms - 1e-6; t += STEP) { const y0 = L.y; stepLane(L, STEP, inp); out.push({ phase: L.phase, s: L.s, dy: ((L.y - y0) % L.per + L.per) % L.per }) } return out }

describe('модель: рабочий ход ↔ медленный ход без остановки', () => {
  it('медленный ход — 25–35 % рабочей скорости, яркость пропорционально', () => {
    expect(SLOW_RATIO).toBeGreaterThanOrEqual(0.25); expect(SLOW_RATIO).toBeLessThanOrEqual(0.35)
    const L = createLane(1); trace(L, IGNITE_MS + ACCEL_MS + 200, RUN); trace(L, SHIFT_MS + 200, SLOW)
    expect(L.phase).toBe('slow'); expect(L.s).toBeCloseTo(RUN_SPEED * SLOW_RATIO, 6)
    expect(laneLook(L).a).toBeCloseTo(REST_A + (RUN_A - REST_A) * SLOW_RATIO, 6)
  })
  it('run → slow → run: ни одного кадра в idle / decel, скорость не падает до нуля и меняется плавно, пунктир не прыгает', () => {
    const L = createLane(0); trace(L, IGNITE_MS + ACCEL_MS + 200, RUN); expect(L.phase).toBe('run')
    const out = trace(L, SHIFT_MS + 1500, SLOW); trace(L, SHIFT_MS + 300, RUN, out)
    expect(out.some(f => f.phase === 'idle' || f.phase === 'decel')).toBe(false)
    expect(Math.min(...out.map(f => f.s))).toBeGreaterThan(RUN_SPEED * SLOW_RATIO * 0.99)
    for (let i = 1; i < out.length; i++) expect(Math.abs(out[i].s - out[i - 1].s)).toBeLessThan(RUN_SPEED * 0.03) // без рывков
    expect(Math.max(...out.map(f => f.dy))).toBeLessThan(RACE_PERIOD / 20) // сдвиг за кадр мал — шва нет
    expect(L.phase).toBe('run'); expect(L.s).toBeCloseTo(RUN_SPEED * L.v, 6)
  })
  it('slow → stop (пауза, итог): плавное торможение до покоя', () => {
    const L = createLane(2); trace(L, IGNITE_MS + ACCEL_MS + 200, RUN); trace(L, SHIFT_MS + 200, SLOW)
    const out = trace(L, DECEL_MS + 100, STOP)
    expect(out[0].phase).toBe('decel'); expect(L.phase).toBe('idle'); expect(L.s).toBe(0)
  })
  it('без slow всё как раньше: команду сняли — decel → idle', () => {
    const L = createLane(); trace(L, IGNITE_MS + ACCEL_MS + 200, { armed: true, keep: true }); trace(L, DECEL_MS + 100, STOP)
    expect(L.phase).toBe('idle')
  })
})

describe('проводка: команда гонки', () => {
  const stages = [
    { race: true, act: 'sprint', type: 'announce' },
    { race: true, act: 'sprint', type: 'student', step: { kind: 'student', active: [0, 1, 2] } },
    { race: true, act: 'catch', type: 'announce', switchTo: 'ru' },
    { race: true, act: 'catch', type: 'student', step: { kind: 'student', active: [0, 1, 2] } },
    { race: true, act: 'summary', type: 'summary' },
  ]
  it('announce-стадия в гонке после первого запуска — медленный ход', () => {
    expect(raceSlowLanes({ lanes: '000', stages, idx: 2, stage: 'run' })).toBe(`000${SLOW_CHAR}`)
    expect(raceSlowLanes({ lanes: '222', stages, idx: 3, stage: 'run' })).toBe('222s')
  })
  it('до первого запуска, на паузе и на итоге — без медленного хода (остановка)', () => {
    expect(raceSlowLanes({ lanes: '000', stages, idx: 0, stage: 'run' })).toBe('000')
    expect(raceSlowLanes({ lanes: '222', stages, idx: 0, stage: 'run' })).toBe('222s') // зажглись к концу первой плашки
    expect(raceSlowLanes({ lanes: '000', stages, idx: 2, stage: 'paused' })).toBe('000')
    expect(raceSlowLanes({ lanes: '000', stages, idx: 4, stage: 'run' })).toBe('000')
    expect(raceSlowLanes({ lanes: '000', stages, idx: 5, stage: 'reveal' })).toBe('000')
  })
  it('репетиция и обычная нода — команда без изменений', () => {
    const rh = stages.map(s => ({ ...s, race: undefined }))
    expect(raceSlowLanes({ lanes: '000', stages: rh, idx: 2, stage: 'run' })).toBe('000')
  })
})

describe('привод гонки: медленный ход и пауза', () => {
  function setup() {
    const cols = [0, 1, 2].map(() => ({ props: {}, style: { setProperty(k, v) { this.owner.props[k] = v } } }))
    cols.forEach(c => { c.style.owner = c })
    let queue = [], t = 1000
    const root = { closest: () => ({}), querySelectorAll: sel => (sel === '.wlLanes i' ? cols : []), querySelector: () => null }
    const drive = createConveyorDrive({ root, now: () => t, raf: f => { queue.push(f); return queue.length }, caf: () => { queue = [] }, observe: () => () => {} })
    return { drive, frames(ms) { for (let el = 0; el < ms && queue.length; el += STEP) { t += STEP; queue.shift()(t) } }, pending: () => queue.length }
  }
  it("'222s' → '000s': дорожки не встают, а едут медленно; цикл не засыпает", () => {
    const h = setup(); h.drive.setArmed('222s'); h.frames(IGNITE_MS + ACCEL_MS + 300)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'run'])
    h.drive.setArmed('000s'); h.frames(SHIFT_MS + 300)
    expect(h.drive.state().phases).toEqual(['slow', 'slow', 'slow']); expect(h.pending()).toBe(1)
    h.drive.setArmed('222s'); h.frames(SHIFT_MS + 300)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'run'])
  })
  it('пауза в гонке: дорожки плавно тормозят до покоя, потом цикл засыпает; снятие паузы — снова в ход', () => {
    const h = setup(); h.drive.setArmed('000s'); h.frames(IGNITE_MS + ACCEL_MS + 300)
    expect(h.drive.state().phases).toEqual(['slow', 'slow', 'slow'])
    h.drive.setArmed('000'); h.drive.setPaused(true); h.frames(DECEL_MS / 2)
    expect(h.drive.state().phases).toEqual(['decel', 'decel', 'decel'])
    h.frames(DECEL_MS); expect(h.drive.state().phases).toEqual(['idle', 'idle', 'idle']); expect(h.pending()).toBe(0)
    h.drive.setArmed('000s'); expect(h.pending()).toBe(0) // на паузе команда не будит
    h.drive.setPaused(false); h.frames(IGNITE_MS + 50); expect(h.drive.state().phases).toEqual(['accel', 'accel', 'accel'])
  })
})
