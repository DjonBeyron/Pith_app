import { describe, it, expect } from 'vitest'
import { ENTER_Y, EXIT_Y, SPEED, LOCK_MS, OPEN_Y, FILL_CAP } from './wordLaneTimeline.js'
import { createStudentGame, stepStudent, STUDENT_PERIOD_MS, MAX_TRIES, CLAIM_FROM_Y, CLAIM_TO_Y, FAIL_Y, LEAD_IN_MS, LOCK_STAGGER_MS, isClaimable } from './wordLaneStudent.js'
import { buildRecipe, stepTargets } from './wordLaneRecipe.js'

// Фаза ученика одной ступени: повторы выкатываются сами, ученик успевает сказать их или нет
const DT = 16
const chunks = ["I'm", 'trying', 'to learn']
const recipe = buildRecipe(chunks)
const build = recipe.rounds[0].steps       // 0: I'm ×3, 1: trying ×3, 2: I'm trying ×3, 3: to learn ×3, 4: вся фраза ×3
const blind = recipe.rounds[2].steps       // 0: три куска по порядку, 1: вся фраза ×2
const word = buildRecipe(['try']).rounds[0].steps[0]

/** Прогон: script(t, g) → { level, hit: номер цели, miss } на каждом кадре; возвращает все события с временем */
function run(g, script, until = 40000) {
  const log = []
  const seq = []
  let misses = 0
  for (let t = 0; t <= until; t += DT) {
    const inp = script(t, g) ?? {}
    if (inp.hit != null) seq.push(inp.hit)
    misses += inp.miss ? 1 : 0
    for (const e of stepStudent(g, t, { level: inp.level ?? 0, seq, misses })) log.push({ t, ...e })
    if (g.finished) break
  }
  return log
}
const of = (log, type) => log.filter(e => e.type === type)
const once = (ms, v = 0) => { let fired = false; return t => { if (!fired && t >= ms) { fired = true; return v } return null } }
const game = (step, chunksIn = chunks) => createStudentGame({ step, chunks: chunksIn })

describe('выкат и скорость', () => {
  it('первый повтор выезжает из-за верхнего края; следующие — через период; куски одного повтора — по порядку, в дорожках кусков', () => {
    const g = game(build[2])
    const log = run(g, () => ({}), 9000)
    const spawns = of(log, 'spawn')
    expect(LEAD_IN_MS).toBe(0)
    expect(spawns[0].t).toBe(0)
    expect(spawns[0].pills.map(p => p.lane)).toEqual([0, 1])
    expect(spawns[0].pills[0].spawnAt).toBe(0)                       // стартует над экраном (ENTER_Y), а не появляется посреди
    expect(ENTER_Y + (SPEED * 0) / 1000).toBe(ENTER_Y)
    expect(spawns[0].pills[1].spawnAt).toBeGreaterThan(spawns[0].pills[0].spawnAt)
    expect(spawns[1].t - spawns[0].t).toBeGreaterThanOrEqual(STUDENT_PERIOD_MS - DT)
  })
  it('одно слово: три повтора — три пилюли в трёх дорожках', () => {
    const g = game(word, ['try'])
    const spawns = of(run(g, () => ({}), 9000), 'spawn')
    expect(spawns.slice(0, 3).map(e => e.pills[0].lane)).toEqual([0, 1, 2])
  })
  it('все пилюли едут с ОДНОЙ скоростью SPEED, пока на экране', () => {
    const g = game(build[2])
    const prev = new Map()
    for (let t = 0; t <= 9000; t += DT) {
      stepStudent(g, t, { level: 0.6, seq: [], misses: 0 })
      for (const p of g.pills) {
        if (prev.has(p.id)) expect(((p.y - prev.get(p.id)) / DT) * 1000).toBeCloseTo(SPEED, 5)
        prev.set(p.id, p.y)
      }
    }
    expect(prev.size).toBeGreaterThanOrEqual(4)
  })
})

describe('«не успел»', () => {
  it('последняя пилюля повтора ушла вниз без слова — fail: пилюли серые, повтор выкатят снова; после MAX_TRIES повтор потерян', () => {
    const g = game(build[0])
    const log = run(g, () => ({}), 60000)
    const fails = of(log, 'fail')
    expect(fails.length).toBe(MAX_TRIES * 3)                      // три повтора по MAX_TRIES попыток
    expect(fails[0].pills.every(p => p.state === 'failed')).toBe(true)
    expect(fails[0].pills[0].y).toBeGreaterThan(FAIL_Y)
    expect(fails.filter(f => f.lost).length).toBe(3)
    expect(of(log, 'done')).toHaveLength(1)
    expect(of(log, 'done')[0].locked).toBe(0)
  })
  it('сначала выкатываются повторы, которых ещё не было, потом повторы неудачных', () => {
    const g = game(build[0])
    const spawns = of(run(g, () => ({}), 12000), 'spawn')
    expect(spawns.slice(0, 3).map(e => e.rep.idx)).toEqual([0, 1, 2])
  })
})

describe('принятое слово', () => {
  it('слово (цель) достаётся САМОМУ СТАРОМУ повтору на экране: claim, snap, win с нотой; пилюли заливаются за LOCK_MS', () => {
    const g = game(build[0])
    const fire = once(3000, 0)
    const log = run(g, t => ({ hit: fire(t) }), 8000)
    const claim = of(log, 'claim')[0]
    expect(claim.rep.idx).toBe(0)
    expect(claim.t).toBeGreaterThanOrEqual(3000)
    const win = of(log, 'win')[0]
    expect(win.t - claim.t).toBeGreaterThanOrEqual(LOCK_MS)
    expect(win.pill.p).toBe(1)
    expect(win.order).toBe(0)
    expect(of(log, 'snap')[0].t).toBeLessThanOrEqual(claim.t + DT)   // щелчок — в тот же кадр, что принятие
  })
  it('повтор из двух кусков: пилюли защёлкиваются по очереди с шагом LOCK_STAGGER_MS, ноты — 0 и 1', () => {
    const g = game(build[2])
    const fire = once(3200, 0)
    const log = run(g, t => ({ hit: fire(t) }), 9000)
    const snaps = of(log, 'snap')
    expect(snaps).toHaveLength(2)
    expect(snaps[1].t - snaps[0].t).toBeGreaterThanOrEqual(LOCK_STAGGER_MS - DT)
    expect(snaps.map(e => e.order)).toEqual([0, 1])
    expect(of(log, 'win')).toHaveLength(2)
  })
  it('слово, сказанное когда на экране ничего нет, — late; цель, которой на экране нет, а другая есть, — промах (дрожь), а не принятие', () => {
    const g = game(blind[0])
    const wrong = once(2800, 2)          // на экране повтор 0 («I\'m»), а сказали третий кусок
    const log = run(g, t => ({ hit: wrong(t) }), 5000)
    expect(of(log, 'claim')).toHaveLength(0)
    expect(of(log, 'miss').some(e => e.wrong)).toBe(true)
    const g2 = game(build[0])
    const early = once(300, 0)                                         // в 300 мс первая пилюля ещё над экраном
    expect(of(run(g2, t => ({ hit: early(t) }), 1000), 'late')).toHaveLength(1)
  })
  it('сказано в нужном порядке три разных куска (вслепую): каждый берёт свой повтор', () => {
    const g = game(blind[0])
    const seq = []
    const log = []
    for (let t = 0; t <= 14000; t += DT) {
      for (const r of g.reps) if (r.state === 'fly' && r.pills[0].y > OPEN_Y && !r.said) { r.said = true; seq.push(r.target) }
      for (const e of stepStudent(g, t, { level: 0, seq, misses: 0 })) log.push({ t, ...e })
      if (g.finished) break
    }
    expect(of(log, 'claim').map(e => e.rep.idx)).toEqual([0, 1, 2])
    expect(of(log, 'done')[0].locked).toBe(3)
    expect(of(log, 'fail')).toHaveLength(0)
  })
})

describe('голос и заливка: только на подтверждённую речь, строго по очереди', () => {
  const frames = (g, ms, input) => { for (let t = g.t; t <= ms; t += DT) stepStudent(g, t, typeof input === 'function' ? input(t) : input) }
  it('шум и эхо без слов (речь не подтверждена распознаванием) заливку не двигают, даже громкие', () => {
    const g = game(build[0])
    frames(g, 6000, { level: 0.9, seq: [], misses: 0, confirmed: false, tail: null })
    expect(g.reps[0].pills.every(p => p.p === 0)).toBe(true)
  })
  it('речь подтверждена — голос наливает текущий кусок, не выше FILL_CAP', () => {
    const g = game(build[0])
    frames(g, 4000, { level: 0.8, seq: [], misses: 0, confirmed: true, tail: null })
    const p = g.reps[0].pills[0].p
    expect(p).toBeGreaterThan(0.1)
    expect(p).toBeLessThanOrEqual(FILL_CAP + 1e-9)
  })
  it('куски одного повтора заливаются СТРОГО ПО ОЧЕРЕДИ: второй не начинает, пока слова первого не произнесены (tail.tokens)', () => {
    const g = game(build[2])                                    // «I'm trying» = 2 + 1 слов («i am», «trying»)
    let secondBeforeFirst = false
    for (let t = 0; t <= 3000; t += DT) {
      // голос идёт всё время, но слова ещё не распознаны
      stepStudent(g, t, { level: 0.8, seq: [], misses: 0, confirmed: true, tail: null })
      const [a, b] = g.reps[0].pills
      if (b && b.p > 0 && a.p < FILL_CAP - 1e-9) secondBeforeFirst = true
    }
    expect(secondBeforeFirst).toBe(false)
    expect(g.reps[0].pills[1].p).toBe(0)
    // распознаны «i am» — первый кусок защёлкнут (зелёный, piece-ok) и доливается до 100 %, второй ещё пуст
    g.reps[0].pills[0].p = 0
    const ev = stepStudent(g, g.t + DT, { level: 0.8, seq: [], misses: 0, confirmed: true, tail: { target: g.reps[0].target, tokens: 2 } })
    expect(ev.filter(e => e.type === 'piece-ok').map(e => e.piece)).toEqual([0])
    expect(g.reps[0].pills[0].state).toBe('lock')
    expect(g.reps[0].pills[1].p).toBe(0)
  })
  it('чужое слово (miss) сливает заливку текущего повтора и сбрасывает прогресс слов', () => {
    const g = game(build[0])
    let misses = 0
    for (let t = 0; t <= 3800; t += DT) { if (t === 2000) misses = 1; stepStudent(g, t, { level: t < 2000 ? 0.8 : 0, seq: [], misses, confirmed: t < 2000, tail: null }) }
    expect(g.reps[0].pills[0].p).toBeLessThan(0.05)
    expect(g.reps[0].tk).toBe(0)
  })
  it('слово принимается, как только пилюля ВИДНА (CLAIM_FROM_Y у верхнего края), а не после полного открытия', () => {
    expect(CLAIM_FROM_Y).toBeLessThanOrEqual(0)
    const g = game(build[0])
    const log = run(g, once(700, 0) && (t => ({ hit: t >= 700 && !g.reps[0].said ? ((g.reps[0].said = true), 0) : null })), 3000)
    expect(of(log, 'claim')).toHaveLength(1)
    expect(of(log, 'claim')[0].t).toBeLessThan(900)     // пилюля выкатилась в 0 мс, к 700 мс её центр ≈ +4 % — уже видна
  })
})

describe('границы', () => {
  it('claimable: только повтор на экране между CLAIM_FROM_Y и CLAIM_TO_Y', () => {
    const rep = (y0, y1, state = 'fly') => ({ state, pills: [{ y: y0 }, { y: y1 }] })
    expect(isClaimable(rep(CLAIM_FROM_Y, CLAIM_TO_Y))).toBe(true)
    expect(isClaimable(rep(CLAIM_FROM_Y - 1, 50))).toBe(false)
    expect(isClaimable(rep(50, CLAIM_TO_Y + 1))).toBe(false)
    expect(isClaimable(rep(50, 60, 'lock'))).toBe(false)
    expect(EXIT_Y).toBeGreaterThan(FAIL_Y)
    expect(OPEN_Y).toBeGreaterThan(CLAIM_FROM_Y)
  })
  it('цели ступени: уникальные тексты и номер цели у каждого повтора', () => {
    expect(stepTargets(blind[0], chunks)).toEqual({ texts: ["I'm", 'trying', 'to learn'], repTarget: [0, 1, 2] })
    expect(stepTargets(build[0], chunks)).toEqual({ texts: ["I'm"], repTarget: [0, 0, 0] })
  })
})
