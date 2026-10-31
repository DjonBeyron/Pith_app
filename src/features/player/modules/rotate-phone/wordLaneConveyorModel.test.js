import { describe, it, expect } from 'vitest'
import {
  createLane, stepLane, laneLook, settled, ease, IGNITE_MS, ACCEL_MS, DECEL_MS, HOLD_MS, CONVEYOR_LEAD_MS, RUN_SPEED, PERIOD, REST_A, RUN_A,
} from './wordLaneConveyor.js'
import { SPEED } from './wordLaneTimeline.js'

// Модель конвейера дорожки (v3.3.85): idle → ignite → accel → run → decel → idle, каждая дорожка сама по себе
const STEP = 1000 / 60
const run = (L, ms, inp) => { for (let t = 0; t < ms - 1e-6; t += STEP) stepLane(L, STEP, inp) ; return L }
const ON = { armed: true, pills: 1 }

describe('конвейер: скорости и времена', () => {
  it('рабочая скорость равна скорости пилюль (SPEED), пунктир 1 px редкий: период больше прежних 8 dvh', () => {
    expect(RUN_SPEED).toBe(SPEED)
    expect(PERIOD).toBeGreaterThan(8)
    expect(IGNITE_MS).toBeGreaterThanOrEqual(200)
    expect(IGNITE_MS).toBeLessThanOrEqual(300)
  })
  it('старт за ≈ 40 кадров (0,66 с) = зажигание + разгон; торможение 0,6–0,8 с', () => {
    expect(CONVEYOR_LEAD_MS).toBe(IGNITE_MS + ACCEL_MS)
    expect(CONVEYOR_LEAD_MS / STEP).toBeGreaterThan(38)
    expect(CONVEYOR_LEAD_MS / STEP).toBeLessThan(42)
    expect(DECEL_MS).toBeGreaterThanOrEqual(600)
    expect(DECEL_MS).toBeLessThanOrEqual(800)
  })
  it('в покое пунктир виден (еле-еле), на ходу ярче', () => {
    expect(REST_A).toBeGreaterThan(0.05)
    expect(REST_A).toBeLessThan(0.25)
    expect(RUN_A).toBeGreaterThan(REST_A * 2)
    expect(laneLook(createLane()).a).toBeCloseTo(REST_A, 9)
  })
})

describe('одна дорожка: зажигание → разгон → ход → торможение → покой', () => {
  it('покой: нет команды и пилюль — стоит, не движется, яркость покоя', () => {
    const L = run(createLane(), 2000, { armed: false, pills: 0 })
    expect(L.phase).toBe('idle')
    expect(L.y).toBe(0)
    expect(settled([L])).toBe(true)
  })
  it('зажигание: IGNITE_MS штрихи стоят, волна идёт 0 → 1, яркость выше покоя; потом разгон', () => {
    const L = createLane()
    stepLane(L, STEP, ON)
    expect(L.phase).toBe('ignite')
    const waves = []
    for (let t = STEP; t < IGNITE_MS - STEP; t += STEP) { stepLane(L, STEP, ON); waves.push(laneLook(L).wave); expect(L.y).toBe(0); expect(L.s).toBe(0) }
    expect(waves[0]).toBeLessThan(0.2)
    expect(waves.at(-1)).toBeGreaterThan(0.8)
    expect(waves.every((w, i) => i === 0 || w > waves[i - 1])).toBe(true)
    expect(laneLook(L).a).toBeGreaterThan(REST_A)
    run(L, STEP * 3, ON)
    expect(L.phase).toBe('accel')
    expect(laneLook(L).wave).toBe(null)
  })
  it('разгон плавный: скорость растёт монотонно без скачков и приходит к SPEED за зажигание + разгон', () => {
    const L = createLane()
    let prev = 0, maxJump = 0
    for (let t = 0; t < CONVEYOR_LEAD_MS + 3 * STEP; t += STEP) { stepLane(L, STEP, ON); maxJump = Math.max(maxJump, L.s - prev); expect(L.s).toBeGreaterThanOrEqual(prev - 1e-9); prev = L.s }
    expect(L.phase).toBe('run')
    expect(L.s).toBe(RUN_SPEED)
    expect(maxJump).toBeLessThan(RUN_SPEED * 0.12) // не рывок: за кадр меньше 12 % рабочей скорости
    expect(laneLook(L).a).toBeCloseTo(RUN_A, 9)
  })
  it('ход: пунктир смещается ровно на SPEED dvh за секунду (по модулю периода)', () => {
    const L = createLane()
    run(L, 1500, ON)
    const y0 = L.y
    run(L, 1000, ON)
    const d = (L.y - y0 + PERIOD) % PERIOD
    expect(d).toBeCloseTo(SPEED % PERIOD, 1)
    expect(L.y).toBeGreaterThanOrEqual(0)
    expect(L.y).toBeLessThan(PERIOD)
  })
  it('торможение: пилюль не осталось → через HOLD_MS замедление за DECEL_MS, плавное, потом покой; яркость спадает до покоя', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, HOLD_MS - 2 * STEP, { armed: true, pills: 0 })
    expect(L.phase).toBe('run') // пауза между повторами ещё не остановка
    let prev = RUN_SPEED, maxDrop = 0
    for (let t = 0; t < HOLD_MS + DECEL_MS + 6 * STEP; t += STEP) {
      stepLane(L, STEP, { armed: true, pills: 0 })
      if (L.phase === 'decel') { maxDrop = Math.max(maxDrop, prev - L.s); expect(L.s).toBeLessThanOrEqual(prev + 1e-9) }
      prev = L.s
    }
    expect(L.phase).toBe('idle')
    expect(L.s).toBe(0)
    expect(maxDrop).toBeLessThan(RUN_SPEED * 0.12)
    expect(laneLook(L).a).toBeCloseTo(REST_A, 9)
  })
  it('пилюли вернулись в паузу HOLD_MS — дорожка не тормозила и не зажигалась заново', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, HOLD_MS - 3 * STEP, { armed: true, pills: 0 })
    run(L, 500, ON)
    expect(L.phase).toBe('run')
    expect(L.s).toBe(RUN_SPEED)
  })
  it('остановка по пилюлям, а не по команде: команду сняли, но пилюли ещё на дорожке — едет; улетели — тормозит', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, 3000, { armed: false, pills: 2 })
    expect(L.phase).toBe('run')
    run(L, 2 * STEP, { armed: false, pills: 0 })
    expect(L.phase).toBe('decel')
  })
  it('команда есть, пилюль ещё не было — ждёт (едет вхолостую до первой пилюли); после того как они ушли — не зажигается снова', () => {
    const L = createLane()
    run(L, 3000, { armed: true, pills: 0 })
    expect(L.phase).toBe('run')
    run(L, 500, ON)
    run(L, HOLD_MS + DECEL_MS + 300, { armed: true, pills: 0 })
    expect(L.phase).toBe('idle')
    run(L, 3000, { armed: true, pills: 0 })
    expect(L.phase).toBe('idle') // команда осталась, пилюль нет — стоим
    run(L, 100, ON)
    expect(L.phase).not.toBe('idle') // появилась пилюля — поехали (с зажиганием)
  })
  it('команда снята и пилюль нет — следующий запуск начинается с нуля (снова ждёт первую пилюлю)', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, HOLD_MS + DECEL_MS + 300, { armed: false, pills: 0 })
    expect(L.phase).toBe('idle')
    run(L, 1500, { armed: true, pills: 0 })
    expect(L.phase).toBe('run')
  })
  it('хотят снова посреди торможения: разгон идёт от текущей скорости, без рывка и без нового зажигания', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, DECEL_MS / 2, { armed: false, pills: 0 }) // команды нет и пилюль нет — пауза HOLD_MS не нужна, тормозит сразу
    expect(L.phase).toBe('decel')
    const before = L.s
    stepLane(L, STEP, ON)
    expect(L.phase).toBe('accel')
    expect(Math.abs(L.s - before)).toBeLessThan(RUN_SPEED * 0.1)
    expect(laneLook(L).wave).toBe(null)
  })
  it('still (слабое устройство / reduced-motion): пунктир не двигается, яркость работает', () => {
    const L = createLane()
    run(L, 3000, { ...ON, still: true })
    expect(L.y).toBe(0)
    expect(laneLook(L).a).toBeCloseTo(RUN_A, 9)
  })
})

describe('дорожки независимы', () => {
  it('едет одна — остальные в покое; добавилась вторая — разгоняется сама; первая встала — вторая едет дальше', () => {
    const [a, b, c] = [createLane(), createLane(), createLane()]
    const tick = (ms, pa, pb) => run(a, ms, { armed: pa > 0, pills: pa }) && run(b, ms, { armed: pb > 0, pills: pb }) && run(c, ms, { armed: false, pills: 0 })
    tick(2000, 1, 0)
    expect([a.phase, b.phase, c.phase]).toEqual(['run', 'idle', 'idle'])
    tick(200, 1, 1)
    expect(b.phase).toBe('ignite')
    expect(a.s).toBe(RUN_SPEED)
    tick(1500, 1, 1)
    expect([a.phase, b.phase]).toEqual(['run', 'run'])
    tick(HOLD_MS + 300, 0, 1)
    expect(a.phase).toBe('decel')
    expect(b.phase).toBe('run')
    tick(DECEL_MS, 0, 1)
    expect([a.phase, b.phase, c.phase]).toEqual(['idle', 'run', 'idle'])
  })
  it('ease: нулевая скорость на концах, середина 0,5', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBe(0.5)
    expect(ease(-1)).toBe(0)
    expect(ease(2)).toBe(1)
  })
})
