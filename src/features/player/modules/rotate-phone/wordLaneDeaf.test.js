import { describe, it, expect } from 'vitest'
import { PILL_H, ENTER_Y, SPEED, LISTEN_Y_MIN, LISTEN_Y_MAX, DEAF_OFFSCREEN_PCT, LISTEN_VISIBLE_TOP_PCT, isListening } from './wordLaneTimeline.js'
import { createStudentGame, stepStudent, isClaimable, CLAIM_TO_Y } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Пилюля, ушедшая за нижний край на 80 % и больше или ещё не вышедшая из-за верхнего на 51 % (v3.3.87), не слушает: не наливается голосом, не принимает слово, не даёт щелчок, ноту, XP и взлёт. Положение считается из таймлайна (без DOM)
const chunks = ["I'm", 'trying', 'to learn']
const steps = buildRecipe(chunks).rounds[0].steps       // 2: I'm trying ×3 (два куска), 4: вся фраза ×3 (три куска)
const tOfY = (spawnAt, y) => spawnAt + ((y - ENTER_Y) / SPEED) * 1000   // момент, когда центр пилюли на высоте y
const hear = (g, t, o = {}) => stepStudent(g, t, { level: 1, seq: [], misses: 0, confirmed: true, ...o })
const start = step => { const g = createStudentGame({ step, chunks }); hear(g, 0); return g }

describe('положение: слушает ли пилюля', () => {
  it('внизу порог — 80 % высоты за краем: при PILL_H = 20 это центр ниже 106; граница уже глухая', () => {
    expect(DEAF_OFFSCREEN_PCT).toBe(80)
    expect(LISTEN_Y_MAX).toBe(106)
    for (const y of [50, 100, 105.99]) expect(isListening(y), String(y)).toBe(true)
    for (const y of [106, 118]) expect(isListening(y), String(y)).toBe(false)
  })
  it('вверху порог — видно 51 % высоты пилюли: при PILL_H = 20 это центр на 0,2 % (верхний край на −9,8 %); ровно 51 % уже слушает', () => {
    expect(LISTEN_VISIBLE_TOP_PCT).toBe(51)
    expect(PILL_H).toBe(20)
    expect(LISTEN_Y_MIN).toBe(0.2)
    const visible = y => (y + PILL_H / 2) / PILL_H                           // доля высоты пилюли, видимая под верхним краем экрана (пока верхний край пилюли выше него)
    expect(visible(LISTEN_Y_MIN)).toBeCloseTo(0.51, 9)
    for (const y of [0.2, 0.21, 5, 50]) expect(isListening(y), String(y)).toBe(true)
    for (const y of [0.19, 0, -3, -6, -9.8, -20]) expect(isListening(y), String(y)).toBe(false)   // прежний порог (−6, видно 20 %) больше не слушает: пилюля ещё почти наполовину за краем
  })
})

describe('внизу: ранний кусок ушёл под экран', () => {
  it('в пределах экрана повтор принимает слово (claim → win)', () => {
    const g = start(steps[2]); const rep = g.reps[0]
    const t = tOfY(0, 60)                                  // первый кусок на 60 %, второй выше — всё на экране
    hear(g, t); expect(isListening(rep.pills[0].y)).toBe(true); expect(isClaimable(rep)).toBe(true)
    const ev = []
    for (let k = 1; k < 120; k++) ev.push(...hear(g, t + k * 16, { seq: [rep.target] }))
    expect(ev.map(e => e.type)).toContain('claim'); expect(ev.filter(e => e.type === 'win')).toHaveLength(2)
  })
  it('граница: первый кусок на 105,99 % — принимает, на 106,01 % — повтор больше не принимает слово, пока последний кусок виден', () => {
    let g = start(steps[2]); let rep = g.reps[0]
    hear(g, tOfY(0, 105.99)); expect(rep.pills[0].y).toBeLessThan(LISTEN_Y_MAX); expect(rep.pills.at(-1).y).toBeLessThanOrEqual(CLAIM_TO_Y); expect(isClaimable(rep)).toBe(true)
    g = start(steps[2]); rep = g.reps[0]
    hear(g, tOfY(0, 106.01)); expect(rep.pills[0].y).toBeGreaterThan(LISTEN_Y_MAX); expect(rep.pills.at(-1).y).toBeLessThanOrEqual(CLAIM_TO_Y) // последний кусок ещё в пределах — раньше повтор принимался
    expect(rep.state).toBe('fly'); expect(isClaimable(rep)).toBe(false)
  })
  it('глухой кусок: голос его не наливает, сказанная фраза не даёт claim / snap / win / взлёта, потом «не успел»', () => {
    const g = start(steps[2]); const rep = g.reps[0]
    const t = tOfY(0, 108)
    const ev = [...hear(g, t - 16), ...hear(g, t), ...hear(g, t + 16, { seq: [rep.target] })]
    expect(rep.pills[0].p).toBe(0); expect(rep.pills[1].p).toBe(0)
    expect(ev.map(e => e.type)).toEqual(['late'])
    const rest = []
    for (let k = 2; k < 400 && !rest.some(e => e.type === 'fail'); k++) rest.push(...hear(g, t + k * 16, { seq: [rep.target] }))
    const types = rest.map(e => e.type)
    expect(types).not.toContain('claim'); expect(types).not.toContain('win'); expect(types).toContain('fail')
    expect(g.locked).toBe(0)
  })
  it('уже принятый кусок (ушёл вниз зелёным) повтор не блокирует: глухим считается только ещё не принятый', () => {
    const g = start(steps[2]); const rep = g.reps[0]
    rep.pills[0].state = 'won'; hear(g, tOfY(0, 108))
    expect(rep.pills[0].y).toBeGreaterThan(LISTEN_Y_MAX); expect(isClaimable(rep)).toBe(true)
  })
})

describe('вверху: пилюля ещё не въехала', () => {
  it('пока видно меньше 51 % куска (центр выше 0,2), голос его не наливает; въехал — наливает', () => {
    const g = start(steps[2]); const rep = g.reps[0]
    const [a, b] = rep.pills
    const tIn = tOfY(b.spawnAt, LISTEN_Y_MIN)
    const said = tokens => ({ tail: { target: rep.target, tokens } })
    let t = 100
    while (a.state !== 'won' && t < tIn) { hear(g, t, said(rep.cnt[0])); t += 16 }
    expect(a.state).toBe('won'); expect(b.y).toBeLessThan(LISTEN_Y_MIN)
    for (; t < tIn - 16; t += 16) { hear(g, t, said(rep.cnt[0] + 1)); expect(b.p).toBe(0) }
    for (t = tIn + 16; t < tIn + 400; t += 16) hear(g, t, said(rep.cnt[0] + 1))
    expect(b.y).toBeGreaterThan(LISTEN_Y_MIN); expect(b.p).toBeGreaterThan(0)
  })
  it('фраза сказана целиком, пока последний кусок над экраном: кусок на экране принят сразу, а за кадром — щелчок, нота и взлёт только когда он въедет', () => {
    const g = start(steps[4]); const rep = g.reps[0]
    const last = rep.pills.at(-1)
    const t0 = tOfY(0, 2)                                                          // первый кусок виден больше чем наполовину, третий ещё глубоко над экраном
    hear(g, t0); expect(last.y).toBeLessThan(LISTEN_Y_MIN)
    const ev = []
    for (let k = 1; k < 250; k++) { const t = t0 + k * 16; for (const e of hear(g, t, { seq: [rep.target] })) ev.push({ t, ...e }) }
    const wins = ev.filter(e => e.type === 'win'); const snaps = ev.filter(e => e.type === 'snap')
    expect(ev.map(e => e.type)).toContain('claim'); expect(wins).toHaveLength(3); expect(rep.state).toBe('won')
    const enter = tOfY(last.spawnAt, LISTEN_Y_MIN)
    const ofLast = list => list.find(e => e.pill === last)
    expect(ofLast(snaps).t).toBeGreaterThan(enter); expect(ofLast(wins).t).toBeGreaterThan(ofLast(snaps).t) // не за кадром
    expect(snaps.find(e => e.pill === rep.pills[0]).t).toBeLessThan(enter)                                    // видимый кусок принят сразу
  })
})
