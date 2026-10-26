import { describe, it, expect } from 'vitest'
import { SLOT_COUNT, ENTER_Y, EXIT_Y, SPEED, LOCK_MS, ZONE_Y, FILL_CAP } from './wordLaneTimeline.js'
import { createStudentGame, stepStudent, STUDENT_PERIOD_MS, MAX_TRIES, CLAIM_FROM_Y, CLAIM_TO_Y, FAIL_Y, LEAD_IN_MS, isClaimable } from './wordLaneStudent.js'

// Фаза ученика — конвейер: пилюли едут сами с постоянной скоростью, ученик успевает сказать слово или нет
const DT = 16
/** Прогон: script(t, g) → { level, hits, misses } на каждом кадре; возвращает все события с временем */
function run(g, script, until = 40000) {
  const log = []
  let hits = 0, misses = 0
  for (let t = 0; t <= until; t += DT) {
    const inp = script(t, g) ?? {}
    hits += inp.hit ? 1 : 0
    misses += inp.miss ? 1 : 0
    for (const e of stepStudent(g, t, { level: inp.level ?? 0, hits, misses })) log.push({ t, ...e, y: e.pill?.y, p: e.pill?.p }) // y и p — снимок в момент события (пилюля потом едет дальше)
    if (g.finished) break
  }
  return log
}
const of = (log, type) => log.filter(e => e.type === type)
/** Сработать один раз, как только время дошло до ms (кадры идут шагом DT, точного совпадения не бывает) */
const once = ms => { let fired = false; return t => { if (!fired && t >= ms) { fired = true; return true } return false } }

describe('конвейер ученика: выкат и скорость', () => {
  it('первая пилюля выезжает из-за верхнего края (LEAD_IN_MS = 0, рывком посреди экрана не появляется), следующие — каждые STUDENT_PERIOD_MS, по одной на дорожку', () => {
    const g = createStudentGame({})
    const log = run(g, () => ({}), 7000)
    const spawns = of(log, 'spawn')
    expect(spawns[0].t).toBe(0)
    expect(spawns[0].y).toBeCloseTo(ENTER_Y + (SPEED * LEAD_IN_MS) / 1000, 6)
    expect(spawns[0].y).toBeLessThanOrEqual(ENTER_Y + 1e-9)       // над экраном
    expect(spawns.slice(0, 3).map(e => e.pill.slot)).toEqual([0, 1, 2])
    expect(spawns[1].t - spawns[0].t).toBeGreaterThanOrEqual(STUDENT_PERIOD_MS - DT)
    expect(spawns[1].t - spawns[0].t).toBeLessThanOrEqual(STUDENT_PERIOD_MS + DT)
  })

  it('все пилюли едут с ОДНОЙ скоростью SPEED, пока на экране; никогда не стоят и не ускоряются', () => {
    const g = createStudentGame({})
    const prev = new Map()
    for (let t = 0; t <= 9000; t += DT) {
      stepStudent(g, t, { level: 0.6, hits: 0, misses: 0 })
      for (const p of g.pills) {
        if (prev.has(p.id)) expect(((p.y - prev.get(p.id)) / DT) * 1000).toBeCloseTo(SPEED, 5)
        prev.set(p.id, p.y)
      }
    }
    expect(prev.size).toBeGreaterThanOrEqual(3)
  })

  it('в дорожке не бывает двух пилюль одновременно (новая не налезает на уходящую)', () => {
    const g = createStudentGame({})
    for (let t = 0; t <= 30000; t += DT) {
      stepStudent(g, t, { level: 0, hits: 0, misses: 0 })
      const alive = g.pills.filter(p => !p.gone).map(p => p.slot)
      expect(new Set(alive).size).toBe(alive.length)
    }
  })
})

describe('«не успел»: пилюля ушла вниз без слова', () => {
  it('промолчал — каждая пилюля получает fail ровно когда центр пересёк FAIL_Y; дорожку выкатывают снова', () => {
    const g = createStudentGame({})
    const log = run(g, () => ({}), 9000)
    const fails = of(log, 'fail')
    expect(fails.length).toBeGreaterThanOrEqual(2)
    for (const f of fails) expect(f.y).toBeGreaterThan(FAIL_Y)
    expect(fails[0].y).toBeLessThan(FAIL_Y + (SPEED * DT) / 1000 + 1e-6) // в первом кадре после пересечения, не позже
    const respawn = of(log, 'spawn').filter(e => e.pill.slot === fails[0].pill.slot)
    expect(respawn.length).toBeGreaterThanOrEqual(2)                         // та же дорожка выкачена повторно
    expect(g.tries[fails[0].pill.slot]).toBeGreaterThanOrEqual(1)
  })

  it('после MAX_TRIES неудач дорожка потеряна, игра заканчивается сама (done с locked=0) за ограниченное время', () => {
    const g = createStudentGame({})
    const log = run(g, () => ({}), 120000)
    expect(g.slot.every(s => s === 'lost')).toBe(true)
    expect(g.tries.every(n => n === MAX_TRIES)).toBe(true)
    const done = of(log, 'done')
    expect(done).toHaveLength(1)
    expect(done[0].locked).toBe(0)
    expect(done[0].t).toBeLessThan(60000)
  })

  it('слово сказано, пока пилюля на экране — это «успел», даже если пилюля уже ниже центра', () => {
    const g = createStudentGame({})
    const log = run(g, (t, game) => ({ hit: game.pills[0]?.y >= 80 && game.seenHits === 0 }), 9000)
    expect(of(log, 'claim')).toHaveLength(1)
    expect(of(log, 'fail').some(e => e.pill.slot === 0)).toBe(false)
  })
})

describe('принятое слово: заливка, щелчок, порядок', () => {
  it('слово достаётся самой старой пилюле на экране; заливка плавно доходит до 100 % за LOCK_MS, затем win (щелчок)', () => {
    const g = createStudentGame({})
    const fire = once(2500)
    const log = run(g, t => ({ hit: fire(t) }), 6000)
    const claim = of(log, 'claim')[0]
    const win = of(log, 'win')[0]
    expect(claim.pill.slot).toBe(0)
    expect(claim.t).toBeGreaterThanOrEqual(2500)
    expect(claim.t).toBeLessThan(2500 + DT)
    expect(win.t - claim.t).toBeGreaterThanOrEqual(LOCK_MS)
    expect(win.t - claim.t).toBeLessThanOrEqual(LOCK_MS + DT * 2)
    expect(win.p).toBe(1)
    expect(win.order).toBe(0)
  })

  it('три слова подряд (по одному на пилюлю) — три win с order 0,1,2 (ноты до-ми-соль), потом done; пилюли едут дальше сами', () => {
    const g = createStudentGame({})
    const log = run(g, (t, game) => ({ hit: game.pills.some(p => p.state === 'fly' && p.y > 30 && p.y < 31) && t % 32 === 0 }), 40000)
    const wins = of(log, 'win')
    expect(wins.map(w => w.order)).toEqual([0, 1, 2])
    expect(wins.map(w => w.pill.slot)).toEqual([0, 1, 2])
    expect(of(log, 'done')).toHaveLength(1)
    expect(of(log, 'done')[0].locked).toBe(3)
    expect(wins[2].t - wins[0].t).toBeLessThan(STUDENT_PERIOD_MS * 3)         // мелодия складывается в темпе конвейера
  })

  it('слово, принятое когда пилюли на экране нет, не теряется молча: событие late', () => {
    const g = createStudentGame({})
    // в нулевой кадр пилюля уже на экране; дожидаемся, пока все провалятся и дорожки пусты, потом «слово»
    const f1 = once(60)
    const log = run(g, t => ({ hit: f1(t) }), 200)
    expect(of(log, 'claim').length + of(log, 'late').length).toBe(1)
    const g2 = createStudentGame({ leadIn: 0 })
    const f2 = once(16)
    const log2 = run(g2, t => ({ hit: f2(t) }), 100) // пилюля ещё за верхним краем (y < CLAIM_FROM_Y)
    expect(of(log2, 'late')).toHaveLength(1)
    expect(of(log2, 'claim')).toHaveLength(0)
  })

  it('пока слово принято не всеми — игра не заканчивается; потерянная дорожка тоже закрывает игру', () => {
    const g = createStudentGame({ maxTries: 1 })
    const log = run(g, (t, game) => ({ hit: game.pills.some(p => p.slot === 0 && p.state === 'fly' && p.y > 40 && p.y < 41) && !game.seenHits }), 60000)
    expect(of(log, 'win')).toHaveLength(1)
    expect(of(log, 'done')).toHaveLength(1)
    expect(of(log, 'done')[0].locked).toBe(1)   // две дорожки не успел и они потеряны (maxTries 1), одна принята
  })
})

describe('голос и «честность»: заливка голосом — ожидающая, чужое слово сливает', () => {
  it('голос наливает пилюлю на экране до FILL_CAP, но не до 100 % — полной её делает только принятое слово', () => {
    const g = createStudentGame({})
    let max = 0
    run(g, (t, game) => { max = Math.max(max, game.pills[0]?.p ?? 0); return { level: 0.8 } }, 2600)
    expect(max).toBeLessThanOrEqual(FILL_CAP + 1e-9)
    expect(max).toBeGreaterThan(0.5)
  })

  it('скорость наливания = длина слова диктора: короткое слово наливается быстрее длинного', () => {
    const fillTime = ms => {
      const g = createStudentGame({ fillMs: [ms, ms, ms] })
      let t0 = null
      for (let t = 0; t <= 9000; t += DT) {
        stepStudent(g, t, { level: 1, hits: 0, misses: 0 })
        const p = g.pills[0]
        if (p.y >= CLAIM_FROM_Y && t0 == null) t0 = t
        if (p.p >= FILL_CAP - 1e-6 && t0 != null) return t - t0
      }
      return Infinity
    }
    expect(fillTime(500)).toBeLessThan(fillTime(1000))
    expect(fillTime(1000)).toBeLessThan(fillTime(1800))
  })

  it('метка темпа стартует с первого звука ученика на этой пилюле', () => {
    const g = createStudentGame({})
    const log = []
    for (let t = 0; t <= 3000; t += DT) { stepStudent(g, t, { level: t >= 1000 ? 0.7 : 0, hits: 0, misses: 0 }); log.push(g.pills[0].onset) }
    expect(log[Math.floor(900 / DT)]).toBeNull()
    expect(g.pills[0].onset).toBeGreaterThanOrEqual(1000)
    expect(g.pills[0].onset).toBeLessThan(1000 + DT * 2)
  })

  it('чужое слово (miss) сливает заливку текущей пилюли и сбрасывает метку темпа; событие miss несёт пилюлю', () => {
    const g = createStudentGame({})
    const fm = once(1500)
    const log = run(g, t => ({ level: t < 1500 ? 0.8 : 0, miss: fm(t) }), 2600)
    const miss = of(log, 'miss')[0]
    expect(miss.pill.slot).toBe(0)
    expect(g.pills[0].p).toBeLessThan(0.05)
    expect(g.pills[0].onset).toBeNull()
  })

  it('claimable: только пилюля на экране в пределах [CLAIM_FROM_Y, CLAIM_TO_Y]', () => {
    expect(isClaimable({ state: 'fly', y: CLAIM_FROM_Y })).toBe(true)
    expect(isClaimable({ state: 'fly', y: CLAIM_TO_Y })).toBe(true)
    expect(isClaimable({ state: 'fly', y: CLAIM_FROM_Y - 1 })).toBe(false)
    expect(isClaimable({ state: 'fly', y: CLAIM_TO_Y + 1 })).toBe(false)
    expect(isClaimable({ state: 'lock', y: 50 })).toBe(false)
    expect(SLOT_COUNT).toBe(3)
    expect(EXIT_Y).toBeGreaterThan(FAIL_Y)
    expect(ZONE_Y).toBeGreaterThan(CLAIM_FROM_Y)
  })
})
