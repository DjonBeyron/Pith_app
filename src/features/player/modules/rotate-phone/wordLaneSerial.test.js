import { describe, it, expect } from 'vitest'
import { createStudentGame, stepStudent, isClaimable, REP_GAP_MS, MAX_TRIES, FAIL_Y, budgetOf } from './wordLaneStudent.js'
import { ENTER_Y, SPEED } from './wordLaneTimeline.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Один повтор на экране за раз: следующий выкатывается, только когда предыдущий разрешился (принят / не успел) и прошла пауза; распознавание и хвост — только текущему повтору;
// время ступени ограничено бюджетом. Заливка («дыхание» голосом) — wordLaneBreath.test.js.
const DT = 16
const chunks = ["I'm", 'trying', 'to learn']
const build = buildRecipe(chunks).rounds[0].steps       // 0: I'm ×3, 1: trying ×3, 2: I'm trying ×3, 3: to learn ×3, 4: вся фраза ×3
const types = (log, type) => log.filter(e => e.type === type)
const game = (step, opts = {}) => createStudentGame({ step, chunks, estMs: () => 500, ...opts })
const alive = g => g.reps.filter(r => r.state === 'fly' || r.state === 'lock')

/** Прогон: script(t, g) → вход шага (level, hit — номер цели, tail, confirmed); возвращает события с временем. hit копится в seq, как у слушателя */
function run(g, script, until = 40000) {
  const log = []
  const seq = []
  let maxAlive = 0
  for (let t = 0; t <= until; t += DT) {
    const inp = script(t, g) ?? {}
    if (inp.hit != null) seq.push(inp.hit)
    for (const e of stepStudent(g, t, { level: inp.level ?? 0, seq, misses: 0, confirmed: inp.confirmed ?? true, tail: inp.tail ?? null })) log.push({ t, ...e })
    maxAlive = Math.max(maxAlive, alive(g).length)
    if (g.finished) break
  }
  log.maxAlive = maxAlive
  return log
}
const sayAt = (ms, target = 0) => { let done = false; return t => { if (!done && t >= ms) { done = true; return target } return null } }

describe('один живой повтор за раз', () => {
  it('без слов: второй повтор не выкатывается, пока первый на экране; на экране всегда не больше одного повтора', () => {
    const g = game(build[2])
    const log = run(g, () => ({}), 16000)
    const spawns = types(log, 'spawn')
    const fails = types(log, 'fail')
    expect(log.maxAlive).toBe(1)
    expect(spawns.length).toBeGreaterThanOrEqual(3)
    expect(spawns[1].t).toBeGreaterThan(fails[0].t)                        // второй — только после «не успел» первого
    expect(spawns[2].t).toBeGreaterThan(fails[1].t)
  })

  it('следующий после принятия: щелчок последнего куска → пауза ≥ REP_GAP_MS → выкат; до этого новых пилюль нет', () => {
    const g = game(build[0])
    const log = run(g, t => ({ hit: sayAt(1500)(t) }), 9000)
    const lastSnap = types(log, 'snap').find(e => e.rep.idx === 0 && e.full)
    const second = types(log, 'spawn')[1]
    expect(REP_GAP_MS).toBeGreaterThanOrEqual(600)
    expect(second.rep.idx).toBe(1)
    expect(second.t - lastSnap.t).toBeGreaterThanOrEqual(REP_GAP_MS - DT)
    expect(second.t - lastSnap.t).toBeLessThan(REP_GAP_MS + 3 * DT)
    expect(log.maxAlive).toBe(1)
  })

  it('следующий после «не успел»: выкатывается сразу по истечении паузы после гашения (последняя пилюля ушла ниже FAIL_Y)', () => {
    const g = game(build[0])
    const log = run(g, () => ({}), 9000)
    const fail = types(log, 'fail')[0]
    const second = types(log, 'spawn')[1]
    expect(fail.pills[0].y).toBeGreaterThan(FAIL_Y)
    expect(second.t - fail.t).toBeGreaterThanOrEqual(REP_GAP_MS - DT)
    expect(second.t - fail.t).toBeLessThan(REP_GAP_MS + 3 * DT)
  })

  it('слово, сказанное в паузе между повторами, — late: следующему повтору оно не достаётся', () => {
    const g = game(build[0])
    const first = sayAt(1500)
    let lateAt = null
    const log = run(g, (t, gm) => {
      if (first(t) != null) return { hit: 0 }
      const gap = gm.reps[0].state === 'won' || gm.reps[0].state === 'lock'                // повтор 0 принят, повтор 1 ещё не выкатили
      if (gap && lateAt == null && !gm.reps.some(r => r.state === 'fly')) { lateAt = t; return { hit: 0 } }
      return null
    }, 4000)
    expect(types(log, 'claim')).toHaveLength(1)
    expect(types(log, 'claim')[0].rep.idx).toBe(0)
    expect(lateAt).not.toBeNull()
    expect(types(log, 'late').some(e => e.t === lateAt)).toBe(true)
    expect(g.reps[1].tries).toBe(0)
    expect(g.reps[1].pills.every(p => p.state === 'fly' && p.p === 0)).toBe(true)
  })

  it('распознанное слово достаётся текущему повтору, а не «старшему» из нескольких: число принятых растёт по одному', () => {
    const g = game(build[0])
    let n = 0
    const log = run(g, (t, game_) => {
      const cur = game_.reps.find(r => r.state === 'fly')
      if (cur && cur.pills[0].y > 10 && !cur.said) { cur.said = true; n += 1; return { hit: 0 } }
      return null
    }, 20000)
    expect(types(log, 'claim').map(e => e.rep.idx)).toEqual([0, 1, 2])
    expect(n).toBe(3)
    expect(log.maxAlive).toBe(1)
    expect(types(log, 'done')[0].locked).toBe(3)
  })
})

describe('время ступени ограничено', () => {
  it('budgetOf = число повторов × (полёт повтора + 1 с) + 3 с', () => {
    const g = game(build[0])
    const life = (FAIL_Y - ENTER_Y) / SPEED * 1000                   // повтор из одного куска живёт до ухода ниже FAIL_Y
    expect(g.budget).toBeCloseTo(3 * (life + 1000) + 3000, 3)
    const two = game(build[2])
    expect(two.budget).toBeCloseTo(3 * (life + 620 + 1000) + 3000, 3)
    expect(budgetOf(0, 5000)).toBe(3000)
  })

  it('ни одного слова: ступень заканчивается около бюджета, а не после MAX_TRIES попыток каждого повтора', () => {
    const g = game(build[0])
    const log = run(g, () => ({}), 80000)
    const done = types(log, 'done')[0]
    const fails = types(log, 'fail')
    expect(done).toBeTruthy()
    expect(done.t).toBeLessThan(g.budget + 5500)                      // последний вышедший до бюджета повтор доезжает и гаснет
    expect(fails.length).toBeLessThan(MAX_TRIES * 3)
    expect(fails.at(-1).lost).toBe(true)
    expect(g.reps.every(r => r.state === 'lost')).toBe(true)
  })

  it('с большим бюджетом работает прежнее правило: MAX_TRIES попыток на повтор', () => {
    const g = game(build[0], { budget: Infinity })
    const log = run(g, () => ({}), 80000)
    expect(types(log, 'fail')).toHaveLength(MAX_TRIES * 3)
    expect(types(log, 'fail').filter(f => f.lost)).toHaveLength(3)
    expect(log.maxAlive).toBe(1)
  })

  it('принятые повторы бюджет не трогает: быстрые ответы — все три приняты', () => {
    const g = game(build[0])
    const log = run(g, (t, gm) => { const c = gm.reps.find(r => r.state === 'fly'); return c && c.pills[0].y > 5 && !c.said ? ((c.said = true), { hit: 0 }) : null }, 30000)
    expect(types(log, 'done')[0].locked).toBe(3)
  })
})

describe('хвост partial: только текущему повтору, устаревший не переносится', () => {
  it('хвост, на котором повтор принят, следующему не достаётся, пока слушатель отдаёт тот же объект; новый черновик (новый объект) — достаётся', () => {
    const g = game(build[2])                                           // «I'm trying»: два куска, «i am» = 2 слова
    const old = { target: 0, tokens: 2 }
    const log = []
    const seq = []
    let t = 0
    const frame = tail => { log.push(...stepStudent(g, t, { level: 0.5, seq, misses: 0, confirmed: true, tail }).map(e => ({ t, ...e }))); t += DT }
    while (!(g.reps[0].state === 'fly' && g.reps[0].pills[0].y > 10)) frame(null)
    seq.push(0); frame(old)                                           // повтор 0 принят вместе с хвостом old
    expect(types(log, 'claim')[0].rep.idx).toBe(0)
    while (!(g.reps[1].state === 'fly' && g.reps[1].pills[0].y > 10)) frame(old)    // хвост висит всё время, пока повтор 1 выкатывается и открывается
    for (let i = 0; i < 40; i++) frame(old)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1)).toHaveLength(0)
    expect(g.reps[1].tk).toBe(0)
    frame({ target: 0, tokens: 2 })                                    // пришёл новый черновик
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1).map(e => e.piece)).toEqual([0])
  })

  it('после «не успел» тот же хвост повтору не достаётся (прежнее правило сохранено)', () => {
    const g = game(build[2])
    const stale = { target: 0, tokens: 2 }
    const log = []
    for (let t = 0; t <= 9000; t += DT) {
      const tail = t < 1500 ? null : t < 8000 ? stale : { target: 0, tokens: 2 }
      log.push(...stepStudent(g, t, { level: 0, seq: [], misses: 0, confirmed: true, tail }).map(e => ({ t, ...e })))
    }
    const fail0 = types(log, 'fail').find(e => e.rep.idx === 0)
    expect(fail0.t).toBeLessThan(8000)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1 && e.t < 8000)).toHaveLength(0)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1 && e.t >= 8000).length).toBeGreaterThan(0)
  })
})

describe('перезапуск слушателя', () => {
  it('счёт слов начался заново (микрофон переоткрыт): следующее слово принимается, а не проглатывается', () => {
    const g = game(build[0])
    const seq = [0, 0]
    g.seenSeq = 2; g.seenMisses = 3                                   // до перезапуска услышано два слова и три чужих
    let t = 0
    while (!isClaimable(g.reps[0])) { stepStudent(g, t, { seq: [], misses: 0 }); t += DT }
    expect(g.seenSeq).toBe(0)                                          // счёт слушателя упал до нуля — движок пошёл за ним
    expect(g.seenMisses).toBe(0)
    seq.length = 0
    seq.push(0)
    const ev = stepStudent(g, t, { seq, misses: 0 })
    expect(ev.map(e => e.type)).toContain('claim')
  })
})
