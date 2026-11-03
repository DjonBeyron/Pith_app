import { describe, it, expect } from 'vitest'
import {
  createLane, stepLane, laneLook, settled, ease, blink, BLINK_MS, BLINKS, IGNITE_MS, ACCEL_MS, DECEL_MS, HOLD_MS, CONVEYOR_LEAD_MS, RUN_SPEED, PERIOD, REST_A, RUN_A,
} from './wordLaneConveyor.js'
import { SPEED } from './wordLaneTimeline.js'

// Модель конвейера дорожки (v3.3.85, плавнее с v3.3.87): idle → ignite → accel → run → decel → idle, каждая дорожка сама по себе
const STEP = 1000 / 60
const run = (L, ms, inp) => { for (let t = 0; t < ms - 1e-6; t += STEP) stepLane(L, STEP, inp) ; return L }
const ON = { armed: true, pills: 1 }

describe('конвейер: скорости и времена', () => {
  it('рабочая скорость равна скорости пилюль (SPEED), пунктир 1 px редкий: период больше прежних 8 dvh', () => {
    expect(RUN_SPEED).toBe(SPEED)
    expect(PERIOD).toBeGreaterThan(8)
    expect(BLINK_MS).toBe(250)
    expect(BLINKS).toBeGreaterThanOrEqual(2)
    expect(BLINKS).toBeLessThanOrEqual(3)
    expect(IGNITE_MS).toBe(BLINK_MS * BLINKS)
  })
  it('старт за зажигание + разгон (1,2 с): разгон длиннее прежних 420 мс; торможение 0,6–0,8 с', () => {
    expect(CONVEYOR_LEAD_MS).toBe(IGNITE_MS + ACCEL_MS)
    expect(ACCEL_MS).toBeGreaterThanOrEqual(800)                       // движение начинается плавнее: разгон вдвое длиннее прежнего
    expect(CONVEYOR_LEAD_MS / STEP).toBeGreaterThan(60)
    expect(CONVEYOR_LEAD_MS / STEP).toBeLessThan(80)
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
  it('зажигание: штрихи стоят, яркость плавно мигает 2 раза (покой → ярко → покой), волны нет; потом разгон', () => {
    const L = createLane()
    stepLane(L, STEP, ON)
    expect(L.phase).toBe('ignite')
    const a = [laneLook(L).a]
    for (let t = STEP; t < IGNITE_MS - STEP; t += STEP) { stepLane(L, STEP, ON); a.push(laneLook(L).a); expect(L.y).toBe(0); expect(L.s).toBe(0); expect(laneLook(L).wave).toBeUndefined() }
    const peaks = a.filter((v, i) => i > 0 && i < a.length - 1 && v > a[i - 1] && v >= a[i + 1]).length
    const dips = a.filter((v, i) => i > 0 && i < a.length - 1 && v < a[i - 1] && v <= a[i + 1]).length
    expect(peaks).toBe(BLINKS)
    expect(dips).toBe(BLINKS - 1)                                                       // между миганиями — возврат в покой
    expect(Math.max(...a)).toBeCloseTo(RUN_A, 1)                                        // пик — рабочая яркость
    expect(a[0] - REST_A).toBeLessThan((RUN_A - REST_A) * 0.1)                          // старт из покоя, не ступенькой
    expect(Math.max(...a.slice(1).map((v, i) => Math.abs(v - a[i])))).toBeLessThan((RUN_A - REST_A) * 0.25) // без скачков (максимум наклона синусоиды за кадр ≈ 0,21)
    run(L, STEP * 4, ON)
    expect(L.phase).toBe('accel')
  })
  it('blink: синусоида 0 → 1 → 0 за BLINK_MS, на стыках циклов 0 с нулевым наклоном', () => {
    expect(blink(0)).toBeCloseTo(0, 9)
    expect(blink(BLINK_MS / 2)).toBeCloseTo(1, 9)
    expect(blink(BLINK_MS)).toBeCloseTo(0, 9)
    expect(blink(BLINK_MS * 1.5)).toBeCloseTo(1, 9)
    expect(blink(IGNITE_MS)).toBeCloseTo(0, 9)
    expect(blink(BLINK_MS * 0.01)).toBeLessThan(0.002)
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
  it('хотят снова посреди торможения: разгон идёт от текущей скорости, без рывка и без нового мигания', () => {
    const L = createLane()
    run(L, 2000, ON)
    run(L, DECEL_MS / 2, { armed: false, pills: 0 }) // команды нет и пилюль нет — пауза HOLD_MS не нужна, тормозит сразу
    expect(L.phase).toBe('decel')
    const before = L.s
    stepLane(L, STEP, ON)
    expect(L.phase).toBe('accel')
    expect(Math.abs(L.s - before)).toBeLessThan(RUN_SPEED * 0.1)
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
