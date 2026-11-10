import { describe, it, expect } from 'vitest'
import { LOCK_MS, FILL_CAP, PRE_CONFIRM_CAP } from './wordLaneTimeline.js'
import { createStudentGame, stepStudent, finOf } from './wordLaneStudent.js'
import { SPEECH_HOLD_MS, PENDING_TOP } from './wordLaneStudentFill.js'
import { createFillView, finishFill } from './wordLaneFillView.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Отчёт владельца со стенда пилюль (2026-11-10, цель «window»): хлопок и вспышка шли при заливке 0,51 (экран доезжал ещё 250 мс), а до зачёта черновики-ловушки подняли заливку до 0,83 и она упала до 0,40.
// Здесь — порядок «доезд → хлопок» (логика ученика + экран) и заливка без отката посреди речи.
const DT = 1000 / 60
const step = buildRecipe(['window']).rounds[0].steps[0]
const game = () => createStudentGame({ step, chunks: ['window'], budget: Infinity })

/** Прогон по кадрам: script(t) → вход шага; на каждом кадре — события и экран (как движок: шаг → события → view.step) */
function run(script, until = 9000) {
  const g = game(), view = createFillView(), frames = [], log = []
  const seq = []
  let misses = 0, last = 0
  for (let t = 0; t <= until; t += DT) {
    const inp = script(t) ?? {}
    if (inp.hit) seq.push(0)
    misses += inp.miss ? 1 : 0
    const evs = stepStudent(g, t, { level: inp.level ?? 0, seq, misses, confirmed: inp.confirmed ?? false, tail: inp.tail ?? null, heardT: inp.confirmed ? t : -Infinity })
    for (const e of evs) log.push({ t, type: e.type })
    const p = g.pills[0]
    const shown = p ? view.step(p.id, p.p, t - last, finOf(p)) : null
    frames.push({ t, goal: p?.p ?? null, shown, evs: evs.map(e => e.type) })
    last = t
  }
  return { frames, log }
}
const at = (log, type) => log.find(e => e.type === type)?.t

describe('зачёт: заливка доезжает, и только тогда — щелчок', () => {
  for (const [name, level, confirmed] of [['заливка 0,40 (речь не подтверждена)', 0.6, false], ['заливка 0,85 (подтверждена)', 0.6, true], ['пустая пилюля (тап, тихий голос)', 0, false]]) {
    it(`${name}: snap и win — в кадре, где экран дошёл до 1,00, через LOCK_MS после принятия`, () => {
      let hit = false
      const { frames, log } = run(t => ({ level: t > 2000 && t < 2900 ? level : 0, confirmed: confirmed && t > 2200, hit: !hit && t >= 3000 ? (hit = true) : false }), 4000)
      const claim = at(log, 'claim'), snap = at(log, 'snap'), win = at(log, 'win')
      expect(snap).toBe(win)                                              // щелчок и награда — одним кадром
      expect(snap - claim).toBeGreaterThanOrEqual(LOCK_MS)
      expect(snap - claim).toBeLessThanOrEqual(LOCK_MS + DT + 0.01)       // путь «зачёт → хлопок» один и тот же при любой заливке
      const f = frames.find(x => x.t === snap), before = frames.filter(x => x.t < snap).at(-1)
      expect(f.shown).toBe(1)                                             // в кадре хлопка экран — ровно 100 %
      expect(before.shown).toBeLessThan(1)                                // а кадром раньше ещё ехал
      expect(before.evs).not.toContain('snap')
      const ride = frames.filter(x => x.t >= claim && x.t <= snap).map(x => x.shown)
      for (let i = 1; i < ride.length; i++) expect(ride[i]).toBeGreaterThanOrEqual(ride[i - 1]) // доезд — только вверх
    })
  }
  it('LOCK_MS — в коридоре «молниеносно, но видимо» (80–140 мс); кривая доезда: от места до 1,00, монотонно', () => {
    expect(LOCK_MS).toBeGreaterThanOrEqual(80); expect(LOCK_MS).toBeLessThanOrEqual(140)
    expect(finishFill(0.4, 0)).toBe(0.4); expect(finishFill(0.4, 1)).toBe(1); expect(finishFill(0.9, 0.5)).toBeGreaterThan(0.9); expect(finishFill(0.4, 2)).toBe(1)
    let prev = 0.4
    for (let u = 0; u <= 1.0001; u += 0.05) { const v = finishFill(0.4, u); expect(v).toBeGreaterThanOrEqual(prev); prev = v }
  })
  it('экран (wordLaneFillView): fin = null — обычный догон; fin 0…1 — доезд от того, что было на экране; forget — с нуля', () => {
    const v = createFillView()
    for (let i = 0; i < 20; i++) v.step('a', 0.5, 16)
    const from = v.value('a')
    expect(from).toBeCloseTo(0.5, 2)
    expect(v.step('a', 1, 16, 0)).toBe(from)                              // принятие: первый кадр — с места
    expect(v.step('a', 1, 16, 0.5)).toBeCloseTo(finishFill(from, 0.5), 6)
    expect(v.step('a', 1, 16, 1)).toBe(1)
    v.forget('a'); expect(v.value('a')).toBe(0)
    expect(v.step('a', 0.3, 16, null)).toBeGreaterThan(0)
  })
})

describe('заливка не прыгает на черновиках-ловушках', () => {
  // Ход как в отчёте: голос 600 мс; на 350-й мс распознаватель «услышал» (ловушка «win»: речь подтверждена, слов цели ещё нет); голос стих; зачёт — через 250 мс после конца голоса
  const script = (claimAfter = 250) => { let hit = false; return t => ({ level: t >= 2000 && t < 2600 ? 0.6 : 0, confirmed: t >= 2350 && t < 4000, hit: claimAfter != null && !hit && t >= 2600 + claimAfter ? (hit = true) : false }) }
  it('пока идёт высказывание (голос и SPEECH_HOLD_MS после него), цель и экран не убывают; зачёт приходит на пике, а не на откате', () => {
    const { frames, log } = run(script(), 4000)
    const claim = at(log, 'claim')
    const speech = frames.filter(f => f.t >= 2000 && f.t <= claim)
    for (let i = 1; i < speech.length; i++) { expect(speech[i].goal).toBeGreaterThanOrEqual(speech[i - 1].goal - 1e-9); expect(speech[i].shown).toBeGreaterThanOrEqual(speech[i - 1].shown - 1e-9) }
    const peak = Math.max(...speech.map(f => f.shown))
    expect(peak).toBeGreaterThan(0.7); expect(peak).toBeLessThanOrEqual(FILL_CAP + 1e-9)
    expect(speech.at(-1).shown).toBeCloseTo(peak, 6)                       // было: 0,83 → 0,40 к моменту зачёта
  })
  it('до подтверждения речи — не выше PRE_CONFIRM_CAP; подтверждение поднимает без ступеньки на экране (не больше 2,5 в секунду)', () => {
    const { frames } = run(script(), 4000)
    expect(Math.max(...frames.filter(f => f.t < 2350).map(f => f.shown ?? 0))).toBeLessThanOrEqual(PRE_CONFIRM_CAP + 1e-9)
    for (let i = 1; i < frames.length; i++) if (frames[i].t < 2850 && frames[i].shown != null && frames[i - 1].shown != null) expect(frames[i].shown - frames[i - 1].shown).toBeLessThanOrEqual(2.5 * DT / 1000 + 1e-9)
  })
  it('слово не подтвердилось (тишина дольше SPEECH_HOLD_MS без зачёта) — стекает; чужое слово — сливается сразу', () => {
    const quiet = run(script(null), 6000).frames
    const end = 2600 + SPEECH_HOLD_MS
    const held = quiet.filter(f => f.t > 2600 && f.t < end - 2 * DT)
    expect(Math.min(...held.map(f => f.goal))).toBeGreaterThan(0.7)        // держит пик, пока ждём ответа распознавателя
    expect(quiet.find(f => f.t > end + 600).goal).toBeLessThan(0.2)       // потом мягко стекает
    expect(quiet.at(-1).shown).toBeLessThan(0.01)
    let miss = false
    const wrong = run(t => ({ level: t >= 2000 && t < 2600 ? 0.6 : 0, confirmed: t >= 2350, miss: !miss && t >= 2700 ? (miss = true) : false }), 4000).frames
    expect(wrong.find(f => f.t > 2700 + 400).goal).toBeLessThan(0.05)      // слив — не ждёт SPEECH_HOLD_MS
  })
  it('цель «договорена» черновиком (хвост слушателя), а зачёта нет: SPEECH_HOLD_MS после пропажи хвоста пилюля стекает, а не стоит на PENDING_TOP', () => {
    const tail = { target: 0, tokens: 99 }
    const { frames } = run(t => ({ level: t >= 2000 && t < 2500 ? 0.6 : 0, confirmed: t >= 2300 && t < 3600, tail: t >= 2400 && t < 2900 ? tail : null }), 6000)
    expect(frames.find(f => f.t > 2880).goal).toBeGreaterThan(FILL_CAP)   // ждём принятия: ползёт к PENDING_TOP
    expect(frames.find(f => f.t > 2880).goal).toBeLessThanOrEqual(PENDING_TOP + 1e-9)
    expect(frames.find(f => f.t > 2900 + SPEECH_HOLD_MS - 100).goal).toBeGreaterThan(FILL_CAP) // ещё держит
    expect(frames.at(-1).goal).toBeLessThan(0.01)                          // распознаватель отказал — стекла
  })
})
