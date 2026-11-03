import { describe, it, expect } from 'vitest'
import {
  createLane, stepLane, laneLook, ease, easeInSoft, LIT, IGNITE_MS, ACCEL_MS, DECEL_MS, HOLD_MS, CONVEYOR_LEAD_MS, RUN_SPEED, REST_A, RUN_A,
} from './wordLaneConveyor.js'

// Плавность конвейера и режим «акт идёт» (v3.3.87) — продолжение wordLaneConveyorModel.test.js (там базовая модель: зажигание → разгон → ход → торможение)
const STEP = 1000 / 60
const run = (L, ms, inp) => { for (let t = 0; t < ms - 1e-6; t += STEP) stepLane(L, STEP, inp); return L }
const ON = { armed: true, pills: 1 }

describe('плавность (v3.3.87): пунктир зажигается мягко, разгон — с медленным стартом, торможение гасит яркость вместе со скоростью', () => {
  it('яркость при мигании и разгоне меняется без скачков: за кадр не больше четверти шкалы (наклон синусоиды); после мигания перед разгоном — снова покой', () => {
    const L = createLane()
    let prev = laneLook(L).a, maxJump = 0
    for (let t = 0; t < IGNITE_MS + ACCEL_MS; t += STEP) {
      stepLane(L, STEP, ON)
      const a = laneLook(L).a
      if (t >= IGNITE_MS + STEP) expect(a).toBeGreaterThanOrEqual(prev - 1e-9) // разгон — яркость только растёт
      maxJump = Math.max(maxJump, Math.abs(a - prev)); prev = a
    }
    expect(maxJump).toBeLessThan((RUN_A - REST_A) * 0.25)
    const first = stepLane(createLane(), STEP, ON)
    expect(laneLook(first).a - REST_A).toBeLessThan((RUN_A - REST_A) * 0.1)
    const end = createLane(); run(end, IGNITE_MS, ON)
    expect(laneLook(end).a - REST_A).toBeLessThan((RUN_A - REST_A) * 0.02)
  })
  it('still (lite / reduced-motion): без мигания — яркость монотонно доходит до LIT к концу зажигания, к концу разгона — до полной', () => {
    const L = createLane()
    let prev = 0
    for (let t = 0; t < IGNITE_MS - STEP; t += STEP) { stepLane(L, STEP, { ...ON, still: true }); expect(L.g).toBeGreaterThanOrEqual(prev - 1e-9); prev = L.g }
    expect(L.g).toBeGreaterThan(LIT * 0.9)
    run(L, ACCEL_MS + 2 * STEP, { ...ON, still: true })
    expect(L.g).toBe(1)
    expect(LIT).toBeGreaterThan(0.3)
  })
  it('easeInSoft: smootherstep — на концах 0 и 1, середина 0,5, старт медленнее smoothstep (прирост в начале ≈ 0)', () => {
    expect(easeInSoft(0)).toBe(0); expect(easeInSoft(1)).toBe(1); expect(easeInSoft(0.5)).toBeCloseTo(0.5, 9)
    expect(easeInSoft(-1)).toBe(0); expect(easeInSoft(2)).toBe(1)
    expect(easeInSoft(0.15)).toBeLessThan(ease(0.15))
    expect(easeInSoft(0.05)).toBeLessThan(0.002)
  })
  it('разгон: первые 10 % времени скорость < 3 % рабочей (мягкий старт), прирост скорости за кадр нарастает, без рывков', () => {
    const L = createLane()
    run(L, IGNITE_MS, ON)
    run(L, ACCEL_MS * 0.1, ON)
    expect(L.s).toBeLessThan(RUN_SPEED * 0.03)
    let prev = L.s, prevStep = 0, maxStep = 0
    for (let t = 0; t < ACCEL_MS * 0.4; t += STEP) { stepLane(L, STEP, ON); const d = L.s - prev; expect(d).toBeGreaterThanOrEqual(prevStep - 1e-9); prevStep = d; maxStep = Math.max(maxStep, d); prev = L.s }
    expect(maxStep).toBeLessThan(RUN_SPEED * 0.05)
  })
  it('торможение: яркость спадает вместе со скоростью (доля яркости = доле скорости), а не отдельно после остановки', () => {
    const L = createLane()
    run(L, 3000, ON)
    run(L, STEP, { armed: false, pills: 0 })
    expect(L.phase).toBe('decel')
    for (let t = 0; t < DECEL_MS - 2 * STEP; t += STEP) {
      stepLane(L, STEP, { armed: false, pills: 0 })
      expect(L.g).toBeCloseTo(L.s / RUN_SPEED, 6)
    }
    run(L, 4 * STEP, { armed: false, pills: 0 })
    expect(L.phase).toBe('idle'); expect(laneLook(L).a).toBeCloseTo(REST_A, 9)
  })
})

describe('«акт идёт» (keep, v3.3.87): дорожка едет непрерывно, пока команда стоит, с пилюлями и без', () => {
  const KEEP = { armed: true, keep: true, pills: 0 }
  it('без единой пилюли — зажигается и едет; сколько бы ни прошло, не тормозит (Пит говорит, ученик промахнулся)', () => {
    const L = createLane()
    run(L, CONVEYOR_LEAD_MS + 200, KEEP)
    expect(L.phase).toBe('run')
    run(L, 20000, KEEP)
    expect(L.phase).toBe('run'); expect(L.s).toBe(RUN_SPEED)
  })
  it('пилюли приходят и уходят — ход не прерывается ни на кадр (скорость всё время рабочая)', () => {
    const L = createLane()
    run(L, 3000, KEEP)
    for (const pills of [1, 0, 0, 2, 0, 0, 0, 1, 0]) for (let t = 0; t < 700; t += STEP) { stepLane(L, STEP, { ...KEEP, pills }); expect(L.s).toBe(RUN_SPEED) }
  })
  it('команду сняли (граница акта): летящие пилюли ещё держат ход, потом торможение; команды нет и пилюль нет — тормозит сразу', () => {
    const L = createLane()
    run(L, 3000, KEEP)
    run(L, 1000, { armed: false, keep: false, pills: 2 })
    expect(L.phase).toBe('run')
    run(L, 2 * STEP, { armed: false, keep: false, pills: 0 })
    expect(L.phase).toBe('decel')
    run(L, DECEL_MS + 100, { armed: false, keep: false, pills: 0 })
    expect(L.phase).toBe('idle')
  })
  it('команда без keep ведёт себя по-старому: пилюль нет дольше HOLD_MS — тормозит', () => {
    const L = createLane()
    run(L, 3000, ON)
    run(L, HOLD_MS + 4 * STEP, { armed: true, pills: 0 })
    expect(L.phase).toBe('decel')
  })
})
