import { describe, it, expect, vi } from 'vitest'
import { createLane, stepLane, laneLook, IGNITE_MS, ACCEL_MS, DECEL_MS, RUN_SPEED, SPEED_RAMP_MS, RACE_PERIOD } from './wordLaneConveyor.js'
import { raceHoldLanes, HOLD_CHAR } from './wordLaneConveyorStart.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// «Встряхни память» (v3.3.142): между ступенями конвейер не тормозит (раньше — провал до 30 %), а держит ход и плавно переходит к скорости следующей ступени; полная остановка — пауза, итог, выход;
// после паузы горячие дорожки разгоняются без «зажигания»
const STEP = 1000 / 60
const RUN = { armed: true, keep: true, hold: true }
const HOLD = { armed: false, hold: true }
const STOP = { armed: false }
function trace(L, ms, inp, out = []) { for (let t = 0; t < ms - 1e-6; t += STEP) { const y0 = L.y; stepLane(L, STEP, inp); out.push({ phase: L.phase, s: L.s, g: L.g, dy: ((L.y - y0) % L.per + L.per) % L.per }) } return out }

describe('модель: держать ход между ступенями', () => {
  it('команду сняли, hold стоит — дорожка едет с рабочей скоростью и полной яркостью, без decel', () => {
    const L = createLane(1); trace(L, IGNITE_MS + ACCEL_MS + 200, RUN)
    const out = trace(L, 3000, HOLD)
    expect(out.every(f => f.phase === 'run')).toBe(true)
    expect(L.s).toBeCloseTo(RUN_SPEED, 6); expect(laneLook(L).a).toBeCloseTo(0.52, 6)
  })
  it('смена ступени: скорость плавно (smoothstep за SPEED_RAMP_MS) переходит к множителю следующей, без провала ниже обеих', () => {
    const L = createLane(0); trace(L, IGNITE_MS + ACCEL_MS + 200, { ...RUN, speed: 1.5 }); expect(L.s).toBeCloseTo(RUN_SPEED * 1.5, 6)
    const out = trace(L, SPEED_RAMP_MS + 300, { ...HOLD, speed: 0.55 })
    expect(out.every(f => f.phase === 'run')).toBe(true)
    expect(Math.min(...out.map(f => f.s))).toBeGreaterThanOrEqual(RUN_SPEED * 0.55 - 1e-9)
    for (let i = 1; i < out.length; i++) { expect(out[i].s).toBeLessThanOrEqual(out[i - 1].s + 1e-9); expect(Math.abs(out[i].s - out[i - 1].s)).toBeLessThan(RUN_SPEED * 0.04) } // монотонно, без рывков
    expect(Math.abs(out[1].s - out[0].s)).toBeLessThan(RUN_SPEED * 0.005) // мягкий старт перехода
    const half = out[Math.round(SPEED_RAMP_MS / 2 / STEP) - 1].s
    expect(half).toBeCloseTo(RUN_SPEED * (1.5 + 0.55) / 2, 0)
    expect(L.s).toBeCloseTo(RUN_SPEED * 0.55, 6)
    expect(Math.max(...out.map(f => f.dy))).toBeLessThan(RACE_PERIOD / 20) // пунктир не прыгает
  })
  it('hold → stop (пауза, итог): плавное торможение до покоя', () => {
    const L = createLane(2); trace(L, IGNITE_MS + ACCEL_MS + 200, RUN); trace(L, 500, HOLD)
    const out = trace(L, DECEL_MS + 100, STOP)
    expect(out[0].phase).toBe('decel'); expect(L.phase).toBe('idle'); expect(L.s).toBe(0)
  })
  it('горячая дорожка (warm) из покоя — сразу разгон, без мигания: яркость растёт монотонно; холодная — с «зажиганием»', () => {
    const hot = createLane(1); hot.warm = true
    const out = trace(hot, ACCEL_MS + 100, RUN)
    expect(out.some(f => f.phase === 'ignite')).toBe(false); expect(out[0].phase).toBe('accel')
    for (let i = 1; i < out.length; i++) expect(out[i].g).toBeGreaterThanOrEqual(out[i - 1].g - 1e-9)
    expect(hot.phase).toBe('run'); expect(hot.warm).toBe(false) // признак израсходован
    const cold = createLane(1); expect(trace(cold, 100, RUN)[0].phase).toBe('ignite')
  })
  it('без hold всё как раньше: команду сняли — decel → idle', () => {
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
  it('плашка / переключение слуха в гонке после первого запуска — держать ход (h), признака медленного хода нет', () => {
    expect(HOLD_CHAR).toBe('h')
    expect(raceHoldLanes({ lanes: '000', stages, idx: 2, stage: 'run' })).toBe('000h')
    expect(raceHoldLanes({ lanes: '222', stages, idx: 3, stage: 'run' })).toBe('222h')
  })
  it('до первого запуска, на паузе и на итоге — без h (остановка)', () => {
    expect(raceHoldLanes({ lanes: '000', stages, idx: 0, stage: 'run' })).toBe('000')
    expect(raceHoldLanes({ lanes: '222', stages, idx: 0, stage: 'run' })).toBe('222h') // зажглись к концу первой плашки
    expect(raceHoldLanes({ lanes: '000', stages, idx: 2, stage: 'paused' })).toBe('000')
    expect(raceHoldLanes({ lanes: '000', stages, idx: 4, stage: 'run' })).toBe('000')
    expect(raceHoldLanes({ lanes: '000', stages, idx: 5, stage: 'reveal' })).toBe('000')
  })
  it('репетиция и обычная нода — команда без изменений', () => {
    const rh = stages.map(s => ({ ...s, race: undefined }))
    expect(raceHoldLanes({ lanes: '000', stages: rh, idx: 2, stage: 'run' })).toBe('000')
  })
})

describe('привод гонки: держать ход, лента, пауза', () => {
  function setup({ tape = false } = {}) {
    const cols = [0, 1, 2].map(() => ({ props: {}, style: { setProperty(k, v) { this.owner.props[k] = v } } }))
    cols.forEach(c => { c.style.owner = c })
    let queue = [], t = 1000
    const host = { tape, hasAttribute: k => k === 'data-tape' && host.tape }
    const log = vi.fn()
    const root = { closest: () => host, querySelectorAll: sel => (sel === '.wlLanes i' ? cols : []), querySelector: () => null }
    const drive = createConveyorDrive({ root, log, now: () => t, raf: f => { queue.push(f); return queue.length }, caf: () => { queue = [] }, observe: () => () => {} })
    return { drive, host, log, frames(ms) { for (let el = 0; el < ms && queue.length; el += STEP) { t += STEP; queue.shift()(t) } }, pending: () => queue.length }
  }
  it("'222h' → '000h': дорожки не тормозят; смена скорости ступени — строка журнала «[conveyor] ступень …»", () => {
    const h = setup(); h.drive.setSpeedHint(1.2, 3); h.drive.setArmed('222h'); h.frames(IGNITE_MS + ACCEL_MS + 300)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'run'])
    h.drive.setSpeedHint(1.5, 4); h.drive.setArmed('000h'); h.frames(SPEED_RAMP_MS + 300)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'run']); expect(h.pending()).toBe(1)
    expect(h.log).toHaveBeenCalledWith(expect.stringMatching(/^\[conveyor\] ступень 4: скорость 31\.2 → 39\.0 dvh\/с \(×1\.20 → ×1\.50\) за 800 мс$/))
  })
  it('лента «Фраз» (data-tape): множитель — ровно скорость пилюль (меньше 1 тоже); без ленты — не медленнее конвейера', () => {
    const plain = setup(); plain.drive.setSpeedHint(0.55, 7); expect(plain.drive.state().speed).toBe(1)
    const h = setup({ tape: true }); h.drive.setSpeedHint(0.55, 7); expect(h.drive.state()).toMatchObject({ speed: 0.55, tape: true })
    h.drive.setSpeedHint(null, -1); expect(h.drive.state().speed).toBe(0.55) // на паузе подсказки нет — лента держит свою скорость
    h.drive.setSpeedHint(0.4, 9); expect(h.drive.state().speed).toBe(0.4)
  })
  it('пауза в гонке: дорожки тормозят до покоя, цикл засыпает; «Продолжить» — горячие дорожки разгоняются без зажигания', () => {
    const h = setup(); h.drive.setArmed('000h'); h.frames(IGNITE_MS + ACCEL_MS + 300)
    expect(h.drive.state().phases).toEqual(['run', 'run', 'run'])
    h.drive.setArmed('000'); h.drive.setPaused(true); h.frames(DECEL_MS / 2)
    expect(h.drive.state().phases).toEqual(['decel', 'decel', 'decel']); expect(h.drive.state().warm).toEqual([true, true, true])
    h.frames(DECEL_MS); expect(h.drive.state().phases).toEqual(['idle', 'idle', 'idle']); expect(h.pending()).toBe(0)
    h.drive.setArmed('000h'); expect(h.pending()).toBe(0) // на паузе команда не будит
    h.drive.setPaused(false); h.frames(50); expect(h.drive.state().phases).toEqual(['accel', 'accel', 'accel'])
    h.frames(ACCEL_MS); expect(h.drive.state().phases).toEqual(['run', 'run', 'run']); expect(h.drive.state().warm).toEqual([false, false, false])
  })
  it('пауза до первого запуска (дорожки стояли) — после «Продолжить» обычное зажигание', () => {
    const h = setup(); h.drive.setPaused(true); h.drive.setPaused(false); h.drive.setArmed('222h'); h.frames(50)
    expect(h.drive.state().phases).toEqual(['ignite', 'ignite', 'ignite'])
  })
})
