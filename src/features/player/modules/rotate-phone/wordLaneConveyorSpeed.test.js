import { describe, it, expect } from 'vitest'
import { createLane, stepLane, RUN_SPEED, SPEED_RAMP_MS } from './wordLaneConveyor.js'
import { conveyorSpeedHint } from './wordLaneConveyorSpeed.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// Второй круг разгона (v3.3.113): скорость конвейера плавно растёт до скорости пилюль за ~800 мс, а не рывком; пунктир едет быстрее пропорционально speed пилюли.
const STEP = 1000 / 60
const run = (L, ms, inp) => { for (let t = 0; t < ms - 1e-6; t += STEP) stepLane(L, STEP, inp); return L }
const ON = { armed: true, pills: 1 }

describe('модель: множитель скорости идёт плавно', () => {
  it('на ходу при speed 1,1 скорость растёт за SPEED_RAMP_MS (≈800 мс) от рабочей к ×1,1 без рывка', () => {
    expect(SPEED_RAMP_MS).toBe(800)
    const L = createLane()
    run(L, 3000, ON)
    expect(L.phase).toBe('run')
    expect(L.s).toBeCloseTo(RUN_SPEED, 5)
    let prev = L.s, maxJump = 0
    for (let t = 0; t < SPEED_RAMP_MS + STEP; t += STEP) { stepLane(L, STEP, { ...ON, speed: 1.1 }); maxJump = Math.max(maxJump, Math.abs(L.s - prev)); prev = L.s }
    expect(L.s).toBeCloseTo(RUN_SPEED * 1.1, 5)
    expect(maxJump).toBeLessThan(RUN_SPEED * 0.1 * 0.05) // за кадр — не больше 5 % всей прибавки: рывка нет
  })
  it('на середине перехода скорость между старой и новой; через 400 мс прибавлено примерно половину', () => {
    const L = createLane()
    run(L, 3000, ON)
    run(L, 400, { ...ON, speed: 1.2 })
    expect(L.s).toBeGreaterThan(RUN_SPEED * 1.05)
    expect(L.s).toBeLessThan(RUN_SPEED * 1.15)
  })
  it('+5 % следующей пилюли тоже подстраивается плавно: цель сменилась в середине перехода — идём от текущего значения', () => {
    const L = createLane()
    run(L, 3000, ON)
    run(L, 300, { ...ON, speed: 1.1 })
    const mid = L.s
    stepLane(L, STEP, { ...ON, speed: 1.155 })
    expect(Math.abs(L.s - mid)).toBeLessThan(RUN_SPEED * 0.02)
    run(L, SPEED_RAMP_MS, { ...ON, speed: 1.155 })
    expect(L.s).toBeCloseTo(RUN_SPEED * 1.155, 5)
  })
  it('стоящая дорожка берёт множитель сразу (разгон идёт к новой скорости), без speed — как раньше', () => {
    const A = createLane(), B = createLane()
    run(A, 3000, { ...ON, speed: 1.3 })
    run(B, 3000, ON)
    expect(A.s).toBeCloseTo(RUN_SPEED * 1.3, 5)
    expect(B.s).toBeCloseTo(RUN_SPEED, 5)
  })
  it('скорость пунктира растёт — сдвиг за кадр пропорционален множителю', () => {
    const A = createLane(), B = createLane()
    run(A, 3000, ON); run(B, 3000, { ...ON, speed: 1.5 })
    const a0 = A.y, b0 = B.y
    stepLane(A, 50, ON); stepLane(B, 50, { ...ON, speed: 1.5 })
    const d = (L, y0) => (L.y - y0 + 11) % 11
    expect(d(B, b0) / d(A, a0)).toBeCloseTo(1.5, 3)
  })
})

describe('привод: пилюли со скоростью и подсказка стадии', () => {
  const cols = [0, 1, 2].map(() => ({ style: { props: {}, setProperty(k, v) { this.props[k] = v } } }))
  const pill = (lane, speed) => ({ dataset: { lane: String(lane), ...(speed ? { speed: String(speed) } : {}) } })
  const mk = pills => ({
    querySelectorAll: sel => (sel === '.wlLanes i' ? cols : pills),
  })
  const drive = pills => { let now = 0; const frames = []; const d = createConveyorDrive({ root: mk(pills), now: () => now, raf: f => { frames.push(f); return frames.length }, caf: () => {}, observe: () => () => {} }); return { d, tick: ms => { now += ms; const f = frames.splice(0); f.forEach(fn => fn(now)) } } }

  it('пилюля со скоростью 1,2 на дорожке: привод просит множитель 1,2; без скорости — 1', () => {
    const { d } = drive([pill(0, 1.2)])
    d.setArmed('100')
    expect(d.state().speed).toBeCloseTo(1.2)
    const { d: d2 } = drive([pill(0)])
    d2.setArmed('100')
    expect(d2.state().speed).toBe(1)
  })
  it('подсказка стадии набирает скорость заранее (пилюль ещё нет); null — сброс к 1', () => {
    const { d } = drive([])
    d.setSpeedHint(1.32)
    expect(d.state().speed).toBeCloseTo(1.32)
    d.setSpeedHint(null)
    expect(d.state().speed).toBe(1)
  })
  it('смена стадии при той же подсказке (круг 1 следующего этапа) сбрасывает виденный максимум предыдущего', () => {
    const pills = [pill(0, 1.4)]
    const { d } = drive(pills)
    d.setSpeedHint(1, 5)
    d.setArmed('100')
    expect(d.state().speed).toBeCloseTo(1.4)
    pills.length = 0
    d.setSpeedHint(1, 5) // та же стадия — максимум держится
    d.setArmed('100')
    expect(d.state().speed).toBeCloseTo(1.4)
    d.setSpeedHint(1, 9) // другая стадия, подсказка та же
    expect(d.state().speed).toBe(1)
  })
  it('внутри стадии множитель не откатывается между пилюлями (виденный максимум держится до смены подсказки)', () => {
    const pills = [pill(0, 1.1), pill(1, 1.2)]
    const { d } = drive(pills)
    d.setSpeedHint(1.1)
    d.setArmed('110')
    expect(d.state().speed).toBeCloseTo(1.2)
    pills.length = 0
    d.setArmed('110')
    expect(d.state().speed).toBeCloseTo(1.2)
  })
})

describe('подсказка скорости по стадиям', () => {
  const stage = (type, act, reps) => ({ race: true, type, act, step: reps ? { reps: reps.map(speed => ({ speed })) } : undefined })
  it('на плашке второго круга — скорость первой пилюли следующей стадии-очереди; на самой очереди — её первой пилюли', () => {
    const stages = [stage('announce', 'sprint'), stage('student', 'sprint', [1, 1.05]), stage('announce', 'sprint'), stage('student', 'sprint', [1.32, 1.386])]
    expect(conveyorSpeedHint(stages, 2)).toBeCloseTo(1.32)
    expect(conveyorSpeedHint(stages, 3)).toBeCloseTo(1.32)
    expect(conveyorSpeedHint(stages, 0)).toBe(1)
  })
  it('другой акт, не гонка, нет индекса — null', () => {
    const stages = [stage('announce', 'climb'), stage('student', 'sprint', [1.1])]
    expect(conveyorSpeedHint(stages, 0)).toBeNull()
    expect(conveyorSpeedHint([{ type: 'student', act: 'x', step: { reps: [{ speed: 2 }] } }], 0)).toBeNull()
    expect(conveyorSpeedHint(stages, -1)).toBeNull()
  })
})
