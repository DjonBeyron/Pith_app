import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createStudentGame, stepStudent, isClaimable, LOCK_STAGGER_MS, MAX_TRIES } from './wordLaneStudent.js'
import { createWordListener, MISS_SETTLE_MS } from './wordLaneListen.js'
import { buildRecipe, stepTargets } from './wordLaneRecipe.js'
import { LOCK_MS } from './wordLaneTimeline.js'

// Индикация при двух и больше словах («I'm … trying»): три состояния куска — «в процессе» (бледная заливка), «верно» (зелёная, data-lock, ПО КУСКАМ по мере произнесения), «неверно» (красная вспышка
// только по итогу или по устоявшемуся промаху, не по паузе между словами). Сценарий ученика идёт через настоящий слушатель (wordLaneListen) и настоящий конвейер (wordLaneStudent) на виртуальных часах.
const DT = 16
const chunks = ["I'm", 'trying', 'to learn']
const build = buildRecipe(chunks).rounds[0].steps
const two = build[2]          // «I'm trying» ×3: два куска («i am» + «trying»)
const three = build[4]        // вся фраза ×3: три куска («i am» + «trying» + «to learn»)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const types = (log, type) => log.filter(e => e.type === type)

/** Виртуальные часы + слушатель Vosk с управляемыми черновиками + конвейер: script — [{ at, partial }|{ at, final }] */
function session(step, script, until = 9000) {
  const { texts } = stepTargets(step, chunks)
  const g = createStudentGame({ step, chunks, estMs: () => 500 })
  let now = 0
  const timers = []
  let cb
  let state = { seq: [], misses: 0, tail: null, heardAt: 0 }
  const l = createWordListener({
    targets: texts, expected: step.reps.length,
    onChange: s => { state = { seq: s.seq, misses: s.misses, tail: s.tail, heardAt: s.heardAt || state.heardAt } },
    runtime: { getModel: () => ({}) }, now: () => now, setTimer: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length }, clearTimer: id => { if (timers[id - 1]) timers[id - 1].fn = null },
    listen: async (model, grammar, callbacks) => { cb = callbacks; return { stop() {}, cancel() {} } },
  })
  l.start()
  const log = []
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    cb.onReady()
    for (now = 0; now <= until; now += DT) {
      for (const tm of timers) if (tm.fn && tm.at <= now) { const f = tm.fn; tm.fn = null; f() }
      for (const sc of script.filter(x => x.at <= now && !x.done)) { sc.done = true; if (sc.partial != null) cb.onPartial(sc.partial); else cb.onResult(sc.final, { words: [] }) }
      const heardAt = Math.max(state.heardAt, l.heardAt())
      for (const e of stepStudent(g, now, { level: 0.5, seq: state.seq, misses: state.misses, confirmed: now - heardAt < 1500 && heardAt > 0, tail: state.tail })) log.push({ t: now, ...e })
    }
    l.dispose()
    return { g, log, state }
  })
}

describe('пауза между словами: «I\'m … trying» не даёт промаха', () => {
  it('«i am» → пауза 1,2 с → «i am trying» → итог: piece-ok(0), потом claim, piece 1 и win; события miss нет, красной вспышки нет', async () => {
    const { log, g } = await session(two, [{ at: 2400, partial: 'i am' }, { at: 3600, partial: 'i am trying' }, { at: 3700, final: 'i am trying' }])
    expect(types(log, 'miss')).toHaveLength(0)
    const ok = types(log, 'piece-ok')
    expect(ok.map(e => e.piece)).toEqual([0])
    expect(ok[0].t).toBeGreaterThanOrEqual(2400)
    expect(ok[0].t).toBeLessThan(2400 + 4 * DT)                         // зелёный сразу после «i am», а не в конце повтора
    const claim = types(log, 'claim')[0]
    expect(claim.t).toBeGreaterThanOrEqual(3600)
    expect(ok[0].t).toBeLessThan(claim.t - 1000)
    const wins = types(log, 'win').filter(e => e.rep.idx === 0)
    expect(wins.map(w => w.order)).toEqual([0, 1])                      // нота первого куска — сразу, второго — на принятии повтора
    expect(wins[0].t).toBeLessThan(2400 + 20 * DT)
    expect(wins.map(w => w.last)).toEqual([false, true])                // XP одна цифра на повтор — на втором куске
    expect(types(log, 'snap').filter(e => e.rep.idx === 0).map(e => e.full)).toEqual([false, true]) // полный щелчок один на повтор — у последнего куска
    expect(g.locked).toBeGreaterThanOrEqual(2)
  })

  it('пока ученик молчит после первого слова, второй кусок не наливается (ни голосом, ни хвостом)', async () => {
    const { g } = await session(two, [{ at: 2400, partial: 'i am' }], 3800)
    const [a, b] = g.reps[0].pills
    expect(a.state === 'lock' || a.state === 'won').toBe(true)
    expect(b.state).toBe('fly')
    expect(b.p).toBe(0)                                                 // голос шёл всё время (level 0.5), но второе слово не услышано
  })
})

describe('куски зеленеют по мере произнесения', () => {
  it('три куска: «i am» → piece-ok(0); «i am trying» → piece-ok(1); «i am trying to learn» → claim и win третьего; каждое piece-ok один раз', async () => {
    const { log } = await session(three, [{ at: 2600, partial: 'i am' }, { at: 3000, partial: 'i am trying' }, { at: 3400, partial: 'i am trying to' }, { at: 3800, partial: 'i am trying to learn' }])
    expect(types(log, 'miss')).toHaveLength(0)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 0).map(e => e.piece)).toEqual([0, 1])
    const claim = types(log, 'claim')[0]
    expect(claim.t).toBeGreaterThanOrEqual(3800)
    expect(types(log, 'win').filter(e => e.rep.idx === 0).map(e => [e.order, e.last])).toEqual([[0, false], [1, false], [2, true]])
    expect(types(log, 'snap').filter(e => e.rep.idx === 0).map(e => e.full)).toEqual([false, false, true])
  })

  it('claim после piece-ok защёлкивает только оставшиеся куски: stagger считается по ним', async () => {
    const { log } = await session(three, [{ at: 2600, partial: 'i am' }, { at: 3400, partial: 'i am trying to learn' }])
    const snaps = types(log, 'snap').filter(e => e.rep.idx === 0)
    expect(snaps.map(e => e.order)).toEqual([0, 1, 2])
    const claim = types(log, 'claim')[0]
    expect(snaps[1].t - claim.t).toBeLessThanOrEqual(2 * DT)               // первый оставшийся кусок защёлкивается сразу
    expect(snaps[2].t - snaps[1].t).toBeGreaterThanOrEqual(LOCK_STAGGER_MS - DT)
  })

  it('устаревший хвост (речи давно нет) куски не защёлкивает', () => {
    const g = createStudentGame({ step: two, chunks, estMs: () => 500 })
    const log = []
    for (let t = 0; t <= 2600; t += DT) log.push(...stepStudent(g, t, { level: 0, seq: [], misses: 0, confirmed: false, tail: { target: g.reps[0].target, tokens: 2 } }))
    expect(types(log, 'piece-ok')).toHaveLength(0)
    expect(g.reps[0].pills.every(p => p.state === 'fly')).toBe(true)
  })

  it('однословный первый кусок: «trying» в цели «trying to» защёлкивает первый кусок', () => {
    const cs = ['trying', 'to learn']
    const st = buildRecipe(cs).rounds[0].steps[2]
    const g = createStudentGame({ step: st, chunks: cs, estMs: () => 500 })
    const log = []
    for (let t = 0; t <= 2600; t += DT) log.push(...stepStudent(g, t, { level: 0.5, seq: [], misses: 0, confirmed: true, tail: { target: g.reps[0].target, tokens: 1 } }))
    expect(types(log, 'piece-ok').map(e => e.piece)).toEqual([0])
  })
})

describe('красное — только по итогу или устоявшемуся промаху; защёлкнутые куски остаются зелёными', () => {
  it('итог «i am» без «trying»: miss, красная вспышка — на втором (незащёлкнутом) куске; первый остаётся зелёным; слив не трогает зелёный', async () => {
    const { log, g } = await session(two, [{ at: 2400, partial: 'i am' }, { at: 3500, final: 'i am' }], 4100)
    const miss = types(log, 'miss')
    expect(miss.length).toBeGreaterThanOrEqual(1)
    expect(miss[0].t).toBeGreaterThanOrEqual(3500)
    const [a, b] = g.reps[0].pills
    expect(miss[0].rep.pills.find(p => p.state === 'fly')).toBe(b)           // вспышка пойдёт на b (так выбирает useWordLanePills)
    expect(a.state === 'lock' || a.state === 'won').toBe(true)
    expect(a.p).toBe(1)
    expect(b.p).toBe(0)
  })

  it('чужое слово, за которым началась цель («cat i am»): промах публикуется только после устаивания (MISS_SETTLE_MS), а не сразу', async () => {
    const { log } = await session(two, [{ at: 2400, partial: 'cat i am' }])
    const miss = types(log, 'miss')
    expect(miss).toHaveLength(1)
    expect(miss[0].t).toBeGreaterThanOrEqual(2400 + MISS_SETTLE_MS)
    expect(types(log, 'piece-ok').map(e => e.piece)).toEqual([0])             // «i am» после чужого слова всё равно защёлкнуло первый кусок
  })

  it('«не успел» после защёлкнутого куска: гаснет весь повтор (включая зелёный), принятые куски в счёт не идут, повтор выкатывают заново целиком', () => {
    const g = createStudentGame({ step: two, chunks, estMs: () => 500 })
    const log = []
    for (let t = 0; t <= 12000; t += DT) {
      const tail = g.reps[0].tries === 0 && g.reps[0].state === 'fly' && isClaimable(g.reps[0]) ? { target: g.reps[0].target, tokens: 2 } : null
      log.push(...stepStudent(g, t, { level: 0.4, seq: [], misses: 0, confirmed: true, tail }))
      if (types(log, 'fail').some(e => e.rep.idx === 0) && g.reps[0].state === 'fly') break
    }
    const fail = types(log, 'fail').find(e => e.rep.idx === 0)
    expect(fail.pills.every(p => p.state === 'failed')).toBe(true)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 0)).toHaveLength(1)
    expect(types(log, 'win').filter(e => e.rep.idx === 0)).toHaveLength(1)         // нота первого куска прозвучала…
    expect(g.locked).toBe(0)                                                        // …но в счёт принятых он не идёт: повтор потерян
    expect(g.reps[0].pills.every(p => p.state === 'fly')).toBe(true)              // выкатили заново: все куски без защёлки
    expect(MAX_TRIES).toBeGreaterThan(1)
  })
})

describe('устаревший хвост', () => {
  it('«i am» сказано, повтор не успели — тот же хвост (устаревший черновик) следующему повтору куски не защёлкивает; новый черновик (новый объект) — защёлкивает', () => {
    const g = createStudentGame({ step: two, chunks, estMs: () => 500 })
    const stale = { target: g.reps[0].target, tokens: 2 }
    const fresh = { target: g.reps[0].target, tokens: 2 }
    const log = []
    for (let t = 0; t <= 8000; t += DT) {
      const tail = t < 1500 ? null : t < 5200 ? stale : fresh       // «i am» сказано в 1,5 с; слушатель отдаёт тот же объект, пока не пришёл новый черновик (в 5,2 с)
      log.push(...stepStudent(g, t, { level: 0, seq: [], misses: 0, confirmed: true, tail }).map(e => ({ t, ...e })))
    }
    expect(types(log, 'fail').some(e => e.rep.idx === 0 && e.t < 5200)).toBe(true)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 0).map(e => e.t)[0]).toBeLessThan(1700)
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1 && e.t < 5200)).toHaveLength(0)       // устаревший хвост повтору 1 не достался
    expect(types(log, 'piece-ok').filter(e => e.rep.idx === 1 && e.t >= 5200).length).toBeGreaterThan(0) // новый — достался
  })
})

describe('движок пилюль подключён к событиям кусков', () => {
  const eng = read('./useWordLanePills.js')
  it('piece-ok → lockPiece (data-lock), claim защёлкивает остальные, красная вспышка — на первом незащёлкнутом куске, полный щелчок — по e.full', () => {
    expect(eng).toContain("const lockPiece = pill => { const k = held.get(pill.id); if (k != null) pool.attr(k, 'data-lock') }")
    expect(eng).toContain("e.type === 'piece-ok') lockPiece(e.pill)")
    expect(eng).toContain('e.rep.pills.forEach(lockPiece)')
    expect(eng).toContain("e.rep.pills.find(p => p.state === 'fly')")
    expect(eng).toContain('{ full: e.full }')
  })
  it('«тень» слова показывается только на незащёлкнутых кусках', () => {
    expect(eng).toContain("p.state === 'fly' && g.reps[p.rep].state === 'fly' ? '0.6'")
  })
})
