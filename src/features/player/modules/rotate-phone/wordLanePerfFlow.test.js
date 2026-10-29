import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createStudentGame, stepStudent, isClaimable } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'
import { createWordListener } from './wordLaneListen.js'
import { snapPill } from './wordLaneSnap.js'

// Производительность оверлея «Повтори за диктором» при трёх кусках, часть 2: один залп искр и одна цифра XP на повтор, пропуск одинаковых черновиков распознавателя,
// кусок звука 2048, кеш «кого можно взять» за шаг конвейера. Часть 1 (слои, заливка, рот и лицо кота) — wordLanePerf.test.js.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('один залп искр и одна цифра XP на повтор', () => {
  afterEach(() => vi.unstubAllGlobals())
  const fakeNode = () => ({ style: {}, appendChild() {}, animate: () => ({ finished: Promise.resolve() }), remove() {} })
  function fakePill() {
    const clip = fakeNode()
    const pill = { ...fakeNode(), querySelector: () => clip, getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 120 }) }
    pill.animate = vi.fn(() => ({ finished: Promise.resolve() }))
    return pill
  }
  function stubDom() {
    const made = []
    vi.stubGlobal('document', { createElement: () => { const n = fakeNode(); made.push(n); return n }, body: fakeNode() })
    vi.stubGlobal('window', { innerWidth: 375, innerHeight: 812 })
    vi.stubGlobal('navigator', { vibrate: vi.fn() })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    return made
  }

  it('snapPill с full: false только хлопает (одна анимация), с full — ещё вспышка, кольцо и залп искр', () => {
    const made = stubDom()
    const quiet = fakePill()
    snapPill(quiet, 0, { full: false })
    expect(quiet.animate).toHaveBeenCalledTimes(1)
    expect(made.length).toBe(0)                           // ни вспышки, ни кольца, ни искр
    const loud = fakePill()
    snapPill(loud, 0)
    expect(loud.animate).toHaveBeenCalledTimes(1)
    expect(made.length).toBeGreaterThan(14)               // вспышка + кольцо + хост залпа + 14 искр
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('движок зовёт полный щелчок только у последнего защёлкнутого куска повтора (ученик) и у договорённого (диктор)', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('{ full: e.full }')
    expect(eng).toContain('{ full: lastPiece }')
  })

  it('конвейер ученика: у повтора из трёх кусков три win, но last — только у последнего; XP за повтор одним числом', () => {
    const chunks = ['i am', 'trying', 'to learn']
    const step = buildRecipe(chunks).rounds.flatMap(r => r.steps).find(s => s.reps.some(r => r.parts.length === 3))
    const g = createStudentGame({ step, chunks, estMs: () => 500 })
    const wins = []
    let seq = []
    for (let t = 0; t <= 12000; t += 16) {
      if (!seq.length && isClaimable(g.reps[0])) seq = [g.reps[0].target]
      for (const e of stepStudent(g, t, { level: 0.5, seq, misses: 0 })) if (e.type === 'win' && e.rep.idx === 0) wins.push(e)
    }
    expect(wins).toHaveLength(3)
    expect(wins.map(w => w.last)).toEqual([false, false, true])
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain('if (rep.last) xpApi.current?.add(XP_PER_PILL * rep.count, rect)')
  })

  it('XP: счётчик и цифры живут в своём компоненте — награда не перерисовывает оверлей', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).not.toContain('xpEvents')
    expect(flow).not.toContain('dismissXp')
    expect(read('./WordLaneXp.jsx')).toContain('export default memo(WordLaneXp)')
  })
})

describe('слушатель: одинаковые черновики пропускаются, подача звука крупнее', () => {
  const tick = () => new Promise(r => setTimeout(r, 0))
  it('повторный partial с тем же текстом не доходит до onChange, но «слышал» отмечается (heardAt)', async () => {
    let t = 5000
    const seen = []
    let cb
    const listen = async (model, grammar, callbacks) => { cb = callbacks; queueMicrotask(() => callbacks.onReady?.()); return { stop() {}, cancel() {} } }
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s), runtime: { getModel: () => ({}) }, listen, now: () => t })
    l.start()
    await tick(); await tick()
    const before = seen.length
    cb.onPartial('try')
    expect(seen.length).toBe(before + 1)
    expect(l.heardAt()).toBe(5000)
    for (let i = 0; i < 20; i++) { t += 23; cb.onPartial('try') }
    expect(seen.length).toBe(before + 1)       // 20 одинаковых черновиков — ни одного publish
    expect(l.heardAt()).toBe(t)                // а «слышал» обновляется
    cb.onPartial('try try')                    // текст изменился — обычный разбор
    expect(seen.length).toBe(before + 2)
    expect(seen.at(-1).hits).toBe(2)
    cb.onResult('try try', { words: [] })      // итог разбирается всегда
    expect(seen.length).toBeGreaterThan(before + 2)
    l.dispose()
  })

  it('кусок звука 2048 кадров вместо 1024', () => {
    const src = read('./wordLaneListen.js')
    expect(src).toContain('chunk: 2048')
    expect(src).not.toContain('chunk: 1024')
    expect(src).not.toContain('64 мс')
  })
})

describe('конвейер ученика: «кого можно взять» считается один раз за шаг', () => {
  it('чужое слово при повторе на экране: список «кого взять» собирается один раз, а не на каждое чтение (раньше — четыре прохода с сортировкой)', () => {
    const chunks = ['try']
    const step = buildRecipe(chunks).rounds[0].steps[0]
    const g = createStudentGame({ step, chunks, estMs: () => 500 })
    let t = 0
    while (!isClaimable(g.reps[0])) { stepStudent(g, t, { level: 0, seq: [], misses: 0 }); t += 16 }
    let calls = 0
    const orig = g.reps.filter.bind(g.reps)
    g.reps.filter = (...a) => { calls++; return orig(...a) }
    const events = stepStudent(g, t, { level: 0, seq: [999], misses: 1 })      // услышана цель, которой нет, и счёт чужих слов вырос
    expect(events.some(e => e.type === 'miss')).toBe(true)
    expect(calls).toBeLessThanOrEqual(1)
    calls = 0
    stepStudent(g, t + 16, { level: 0, seq: [999], misses: 1 })
    expect(calls).toBeLessThanOrEqual(1)                                         // обычный шаг без событий — тоже один проход
  })
})
