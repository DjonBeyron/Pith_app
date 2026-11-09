import { describe, it, expect, vi } from 'vitest'
import { createLane, stepLane, retimeSpeed, speedRampLeft, slowRampMs, IGNITE_MS, ACCEL_MS, SPEED_RAMP_MS, SLOW_RAMP_MIN_MS, SLOW_RAMP_MAX_MS, SLOW_CUT_MS } from './wordLaneConveyor.js'
import { createConveyorDrive } from './laneConveyorDrive.js'

// Замедление между этапами гонки (v3.3.173): множитель падает (×1,79 → ×0,55) не за 800 мс, а пока Пит рассказывает про следующий этап — 2…5 с, без ступенек;
// рост и смена скорости внутри этапа — как раньше, 800 мс
const STEP = 1000 / 60
const HOLD = { armed: false, hold: true }
const hot = (speed = 1.79) => { const L = createLane(1); for (let t = 0; t < IGNITE_MS + ACCEL_MS + 1200; t += STEP) stepLane(L, STEP, { ...HOLD, speed }); return L }
function trace(L, ms, inp) { const v = []; for (let t = 0; t < ms - 1e-6; t += STEP) { stepLane(L, STEP, inp); v.push(L.v) } return v }
const smooth = (v, from, to) => { // монотонно от from к to, соседние кадры без скачка
  const down = to < from, jumps = v.slice(1).map((x, i) => x - v[i])
  expect(jumps.every(d => (down ? d <= 1e-9 : d >= -1e-9))).toBe(true)
  return Math.max(...jumps.map(Math.abs))
}

describe('модель: длина перехода скорости (ramp)', () => {
  it('slowRampMs: не короче 2 с и не длиннее 5 с, иначе — сколько Пит говорит', () => {
    expect([SLOW_RAMP_MIN_MS, SLOW_RAMP_MAX_MS]).toEqual([2000, 5000])
    expect(slowRampMs(0)).toBe(2000); expect(slowRampMs(3100)).toBe(3100); expect(slowRampMs(9000)).toBe(5000); expect(slowRampMs(500, 2600)).toBe(2600)
  })
  it('падение ×1,79 → ×0,55 за ramp 3000 мс: монотонно, без скачков, к концу ровно 0,55; на середине ещё не доехало', () => {
    const L = hot(), v = trace(L, 3000 + STEP, { ...HOLD, speed: 0.55, ramp: 3000 })
    const jump = smooth([1.79, ...v], 1.79, 0.55)
    expect(jump).toBeLessThan(((1.79 - 0.55) * 1.5 * STEP) / 3000 + 1e-9) // smoothstep: наибольший шаг — 1,5 средней скорости
    expect(v[Math.round(1000 / STEP)]).toBeGreaterThan(1.4)
    expect(L.v).toBeCloseTo(0.55, 9); expect(speedRampLeft(L)).toBe(0)
  })
  it('без ramp — как раньше: 800 мс (рост ×1 → ×1,1 и падение)', () => {
    const L = hot(1), v = trace(L, SPEED_RAMP_MS, { ...HOLD, speed: 1.1 })
    smooth([1, ...v], 1, 1.1); expect(L.v).toBeCloseTo(1.1, 9)
  })
  it('retimeSpeed: продление посреди перехода — значение не прыгает, наклон сохраняется, кривая монотонна до новой цели', () => {
    const L = hot(), inp = { ...HOLD, speed: 0.55, ramp: 2000 }
    const a = trace(L, 1200, inp)
    const before = a.at(-1) - a.at(-2)
    expect(retimeSpeed(L, 2800)).toBe(true); expect(speedRampLeft(L)).toBe(2800)
    const b = trace(L, 2800 + STEP, inp)
    smooth([1.79, ...a, ...b], 1.79, 0.55)
    expect(Math.abs(b[0] - a.at(-1))).toBeLessThan(Math.abs(before) * 1.01 + 1e-9) // первый кадр после продления — шаг не больше прежнего
    expect(L.v).toBeCloseTo(0.55, 9)
  })
  it('retimeSpeed без перехода — ничего не делает', () => { const L = hot(1); expect(retimeSpeed(L, 2000)).toBe(false) })
})

describe('привод гонки: замедление под реплику Пита', () => {
  function setup({ tape = false } = {}) {
    const cols = [0, 1, 2].map(() => ({ props: {}, style: { setProperty(k, v) { this.owner.props[k] = v } } }))
    cols.forEach(c => { c.style.owner = c })
    let queue = [], t = 1000, pit = 0, held = []
    const host = { tape, hasAttribute: k => k === 'data-tape' && host.tape }
    const log = vi.fn()
    let onMut = () => {}
    const root = { closest: () => host, querySelectorAll: sel => (sel === '.wlLanes i' ? cols : held), querySelector: () => null }
    const drive = createConveyorDrive({ root, log, talk: () => pit, now: () => t, raf: f => { queue.push(f); return queue.length }, caf: () => { queue = [] }, observe: (_, fn) => { onMut = fn; return () => {} } })
    const v = []
    return {
      drive, log, v, setPit: ms => { pit = ms }, pill: speed => { held = [{ dataset: { lane: '1', speed: String(speed) } }]; onMut() },
      frames(ms, tick = () => {}) { for (let el = 0; el < ms && queue.length; el += STEP) { t += STEP; tick(el); queue.shift()(t); v.push(drive.state().v[1]) } },
    }
  }
  const lines = h => h.log.mock.calls.map(c => c[0]).filter(s => s.startsWith('[conveyor]'))
  const goFast = h => { h.drive.setSpeedHint(1.79, 3); h.drive.setArmed('222h'); h.frames(IGNITE_MS + ACCEL_MS + 1200); h.v.length = 0 }

  it('этап сменился, ×1,79 → ×1,00, Пит молчит — замедление 2000 мс (минимум), журнал с пометкой', () => {
    const h = setup(); goFast(h)
    h.drive.setSpeedHint(1, 4); h.drive.setArmed('000h'); h.frames(1000)
    expect(h.drive.state().v[1]).toBeGreaterThan(1.3) // через секунду ещё далеко от ×1
    h.frames(1100)
    expect(h.drive.state().v[1]).toBeCloseTo(1, 6)
    expect(lines(h).at(-1)).toBe('[conveyor] ступень 4: скорость 46.5 → 26.0 dvh/с (×1.79 → ×1.00) за 2000 мс (замедление под реплику, Пит говорит ещё 0 мс)')
    smooth(h.v, 1.79, 1)
  })
  it('Пит уже говорит 3400 мс — замедление 3400 мс; 9 с — не дольше 5000', () => {
    const h = setup(); goFast(h); h.setPit(3400)
    h.drive.setSpeedHint(1, 4); h.frames(STEP)
    expect(lines(h).at(-1)).toMatch(/за 3400 мс \(замедление под реплику, Пит говорит ещё 3400 мс\)$/)
    const k = setup(); goFast(k); k.setPit(9000); k.drive.setSpeedHint(1, 4); k.frames(STEP)
    expect(lines(k).at(-1)).toMatch(/за 5000 мс/)
  })
  it('реплика зазвучала после смены ступени (лента «Фраз» ×0,55) — замедление продлено до её конца, кривая монотонна, без скачков', () => {
    const h = setup({ tape: true }); goFast(h)
    h.drive.setSpeedHint(0.55, 9)
    let pit = 0
    h.frames(4600, el => { pit = el < 1350 ? 0 : Math.max(0, 1350 + 2640 - el); h.setPit(pit) })
    const ext = lines(h).find(s => s.includes('продлено'))
    expect(ext).toMatch(/^\[conveyor\] ступень 9: замедление продлено до (39|40)\d\d мс \(Пит говорит ещё \d+ мс\)$/)
    expect(lines(h).some(s => /за 2000 мс, лента \(замедление под реплику/.test(s))).toBe(true)
    const jump = smooth(h.v, 1.79, 0.55)
    expect(jump).toBeLessThan(0.02) // за кадр множитель меняется меньше чем на 0,02
    expect(h.drive.state().v[1]).toBeCloseTo(0.55, 6); expect(h.drive.state().slow).toBe(null)
  })
  it('посреди замедления выехала пилюля следующего этапа — дотягивается за SLOW_CUT_MS, без скачка', () => {
    const h = setup({ tape: true }); goFast(h); h.setPit(4000)
    h.drive.setSpeedHint(0.55, 9); h.frames(1000)
    h.pill(0.55); h.frames(SLOW_CUT_MS + 50)
    expect(lines(h).at(-1)).toBe(`[conveyor] ступень 9: выехала пилюля — замедление дотягивается за ${SLOW_CUT_MS} мс`)
    expect(h.drive.state().v[1]).toBeCloseTo(0.55, 6)
    smooth(h.v, 1.79, 0.55)
  })
  it('рост скорости на смене ступени и смена внутри этапа — 800 мс, как раньше', () => {
    const h = setup(); h.setPit(3000); h.drive.setSpeedHint(1, 3); h.drive.setArmed('222h'); h.frames(IGNITE_MS + ACCEL_MS + 300)
    h.drive.setSpeedHint(1.5, 4); h.frames(SPEED_RAMP_MS + 50)
    expect(lines(h).at(-1)).toMatch(/×1\.00 → ×1\.50\) за 800 мс$/)
    expect(h.drive.state().v[1]).toBeCloseTo(1.5, 6)
  })
})
