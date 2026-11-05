import { describe, it, expect } from 'vitest'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent, yOfPill } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN, ENTER_Y, SPEED, PILL_H } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { HALF_Y, PIT_TAIL_MS, halfTravelMs, spawnEarly } from '../player/modules/rotate-phone/wordLaneConveyorSpeed.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Тайминг следующей пилюли «Разгона» (CONCEPT_RACE.md): после верного ответа Пит хвалит (через 500 мс) и говорит перевод следующего слова; Пит заканчивает ровно в миг, когда пилюля этого слова выехала из-за верхнего края на 50 %.
// Выезд начинается ЗАРАНЕЕ: startAt = конец речи − время пути до 50 % (из скорости пилюли). Речь короче пути — пилюля стартует сразу, Пит договаривает по ходу.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const sprint = () => buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(s => s.act === 'sprint' && s.type === 'student')
const make = () => { const s = sprint(); return { s, g: createStudentGame({ step: { ...s.step, goodAt: [] }, chunks: s.step.chunks, estMs: () => 400, maxTries: s.step.maxTries }), targets: stepTargets(s.step, s.step.chunks).repTarget } }

/** Довести игру до момента, когда второе слово принято, и до события 'pre' (Пит свободен — говорит перевод следующей пилюли). → { t, g } */
function untilPre() {
  const { g, targets } = make()
  let t = 0
  while (!g.pills.length && t < 3000) { stepStudent(g, t); if (g.reps[0].state === 'todo' && !g.reps[0].pre) { const ev = stepStudent(g, (t += 16)); if (ev.some(e => e.type === 'pre')) stepStudent(g, (t += 16)) } t += 16 }
  while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
  stepStudent(g, (t += 16), { seq: [targets[0]], confirmed: true })
  for (let i = 0; i < 80; i++) {
    const ev = stepStudent(g, (t += 16), { seq: [targets[0]], confirmed: true })
    if (ev.some(e => e.type === 'pre')) return { t, g, pre: ev.find(e => e.type === 'pre').rep }
  }
  throw new Error('pre не пришёл')
}

describe('время пути пилюли до 50 % видимости', () => {
  it('из скорости: центр пилюли идёт от ENTER_Y до верхнего края (50 % высоты видно) за (HALF_Y − ENTER_Y) / (SPEED · speed)', () => {
    expect(HALF_Y).toBe(0); expect(PIT_TAIL_MS).toBe(80)
    expect(halfTravelMs(1)).toBeCloseTo((14 / 26) * 1000, 3); expect(halfTravelMs(1.5)).toBeCloseTo(halfTravelMs(1) / 1.5, 6); expect(halfTravelMs(0)).toBe(halfTravelMs(1)) // нет скорости — как ×1
    expect((HALF_Y + PILL_H / 2 - 0) / PILL_H).toBeCloseTo(0.5, 6) // центр на верхнем крае: видна ровно половина высоты
    expect(ENTER_Y + (SPEED * halfTravelMs(1.2) * 1.2) / 1000).toBeCloseTo(HALF_Y, 6)
  })
  it('spawnEarly: до конца речи (без хвоста занятости 80 мс) осталось не больше пути — пора выезжать; дольше — ждать; речь короче пути — сразу', () => {
    const d = halfTravelMs(1.05)
    expect(spawnEarly(d + PIT_TAIL_MS + 1, 1.05)).toBe(false); expect(spawnEarly(d + PIT_TAIL_MS, 1.05)).toBe(true); expect(spawnEarly(0, 1.05)).toBe(true); expect(spawnEarly(300, 1.05)).toBe(true)
  })
})

describe('«Разгон»: пилюля выезжает заранее, чтобы Пит договорил на её 50 %', () => {
  it('перевод звучит D мс: пилюля стартует за halfTravel до конца речи — в миг конца её центр на верхнем крае (±1 кадр)', () => {
    const { t, g, pre } = untilPre(), D = 2400
    const end = t + D // Пит заканчивает говорить; в движок это приходит как pitMs = остаток + хвост занятости
    let at = t, spawn = null
    for (let k = 0; k < 400 && !spawn; k++) {
      at += 16
      const left = Math.max(0, end + PIT_TAIL_MS - at)
      spawn = stepStudent(g, at, { seq: [], hold: left > 0, pitMs: left }).find(e => e.type === 'spawn')
    }
    expect(spawn).toBeTruthy(); expect(spawn.rep.idx).toBe(pre.idx)
    expect(spawn.rep.spawnAt).toBeGreaterThanOrEqual(end - halfTravelMs(spawn.rep.speed) - 16 - PIT_TAIL_MS); expect(spawn.rep.spawnAt).toBeLessThanOrEqual(end - halfTravelMs(spawn.rep.speed) + 16 + PIT_TAIL_MS)
    expect(spawn.rep.spawnAt).toBeLessThan(end) // не после конца речи
    const y = yOfPill(spawn.pills[0], end)
    expect(Math.abs(y - HALF_Y)).toBeLessThan(((SPEED * spawn.rep.speed * (16 + PIT_TAIL_MS)) / 1000) + 0.01) // центр у верхнего края: видно ~50 %
  })
  it('пока до конца речи дольше пути, пилюля стоит; перед ней стоит строгий hold без pitMs (старое поведение)', () => {
    const { t, g } = untilPre()
    const ev = stepStudent(g, t + 16, { hold: true, pitMs: 5000 })
    expect(ev.some(e => e.type === 'spawn')).toBe(false)
    expect(stepStudent(g, t + 32, { hold: true }).some(e => e.type === 'spawn')).toBe(false) // hold без pitMs — «занят надолго»
  })
  it('речь короче пути: пилюля стартует сразу, на следующем кадре после перевода', () => {
    const { t, g, pre } = untilPre()
    const sp = stepStudent(g, t + 16, { hold: true, pitMs: 200 }).find(e => e.type === 'spawn')
    expect(sp?.rep.idx).toBe(pre.idx)
  })
  it('без перевода (Пит молчит, hold нет): пилюля выезжает сразу, как раньше', () => {
    const { t, g } = untilPre()
    expect(stepStudent(g, t + 16, { hold: false, pitMs: 0 }).some(e => e.type === 'spawn')).toBe(true)
  })
  it('подключено: движок передаёт остаток речи Пита (pitMs), в логике выезда — spawnEarly, а перевод по-прежнему ждёт полной тишины Пита', async () => {
    const { readFileSync } = await import('node:fs')
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    expect(read('../player/modules/rotate-phone/useWordLanePills.js')).toContain('pitMs = fxRef.current?.pitLeft?.() ?? 0, hold = pitMs > 0')
    const st = read('../player/modules/rotate-phone/wordLaneStudent.js')
    expect(st).toContain('spawnEarly(pitMs, next.speed)'); expect(st).toContain('!rep.pre && !hold') // событие pre (Пит говорит перевод) — только когда Пит свободен целиком
  })
})
