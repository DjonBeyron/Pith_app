import { describe, it, expect } from 'vitest'
import { runStandWord, standStep, STILL_SPEED } from './standWordRun.js'
import { standTurn, standListen } from './standPhraseRun.js'
import { stillPool } from './standPool.js'
import { createStandTrace } from './pillStandTrace.js'
import { createPhraseListener as stub } from '../pitrace/racePhraseListenStub.js'

const fakePool = () => {
  const st = { taken: [], attrs: [], fills: [], placed: [], unplaced: [], given: 0 }
  return { st, take: (lane, o) => { st.taken.push({ lane, ...o }); return 0 }, attr: (k, a) => st.attrs.push(a), paintFill: (k, v) => st.fills.push(v), el: () => null, place: (k, y) => st.placed.push(y), unplace: k => st.unplaced.push(k), give: () => { st.given++ }, giveAll: () => { st.given++ } }
}
const clock = () => { let t = 1000; const q = []; return { now: () => t, raf: f => { q.push(f); return q.length }, caf: () => {}, run(n, dt = 16) { for (let i = 0; i < n; i++) { t += dt; const fs = q.splice(0); fs.forEach(f => f(t)) } } } }

describe('стенд пилюль: вертикальная пилюля слова (логика ученика игры)', () => {
  it('ступень из цели: повтор стоит на месте (y0, почти нулевая скорость), на пилюле перевод, русская цель — lang ru', () => {
    const st = standStep({ n: 2, say: 'cat', shown: 'кот', lang: 'en' }, 34)
    expect(st.reps[0]).toMatchObject({ y0: 34, speed: STILL_SPEED, cap: 'кот', lane: 1 })
    expect(st.lang).toBeUndefined()
    expect(standStep({ n: 0, say: 'кот', shown: 'cat', lang: 'ru' }, 34).lang).toBe('ru')
  })
  it('пул «на месте»: без полёта, сразу на высоте y; give снимает место', () => {
    const p = fakePool(), sp = stillPool(p, 33)
    expect(sp.take(1, { cap: 'x' })).toBe(0)
    expect(p.st.taken[0]).toMatchObject({ flight: false, cap: 'x' })
    expect(p.st.placed).toEqual([33])
    expect(sp.y(0)).toBe(33)
    expect(sp.rise(0)).toBeNull()
    sp.giveAll()
    expect(p.st.unplaced).toEqual([0])
    expect(sp.y(0)).toBeNull()
  })
  it('слово услышано → зачёт: пилюля выдана с переводом, принята (data-lock), заливка до 100 %, всё в трассе', () => {
    const c = clock(), pool = fakePool(), trace = createStandTrace({ log: () => {}, now: c.now })
    let ear = null, disposed = false, result = null
    const listen = o => { ear = o; return { start() {}, dispose() { disposed = true }, heardAt: () => 0 } }
    const run = runStandWord({ pool, target: { n: 0, mode: 'word', lang: 'en', say: 'cat', shown: 'кот' }, y: 34, trace, listen, onResult: r => { result = r }, now: c.now, raf: c.raf, caf: c.caf, getStream: () => null })
    expect(ear.targets).toEqual(['cat'])
    expect(ear.lang).toBe('en')
    c.run(3)
    expect(pool.st.taken[0]).toMatchObject({ cap: 'кот', quiet: true })
    ear.onChange({ status: 'listening', seq: [0], misses: 0, heard: 'cat', tail: null, heardAt: Date.now() })
    c.run(80)
    expect(result).toMatchObject({ ok: true, ratio: 1, clean: true })
    expect(pool.st.attrs).toContain('data-lock')
    expect(Math.max(...pool.st.fills)).toBeCloseTo(1, 2)
    const kinds = trace.events().map(e => e.type ?? e.k)
    for (const k of ['target-run', 'listen', 'spawn', 'claim', 'snap', 'win', 'fill']) expect(kinds).toContain(k)
    run.stop()
    expect(disposed).toBe(true)
  })
})

describe('стенд пилюль: широкая пилюля фразы (сцена «Скажи» игры)', () => {
  it('ход: «по словам» — проход 1, «быстро» — проход 2, кандидат — сама фраза', () => {
    expect(standTurn({ n: 1, lang: 'en', mode: 'words', say: 'Nice to meet you' })).toMatchObject({ pass: 1, target: { key: 'Nice to meet you', text: 'Nice to meet you' }, cands: [{ right: true, text: 'Nice to meet you' }] })
    expect(standTurn({ n: 1, lang: 'ru', mode: 'fast', say: 'Как дела' }).pass).toBe(2)
  })
  it('слушатель фраз игры с прослушкой: язык цели, слова и зачёт уходят и сцене, и в трассу', () => {
    const trace = createStandTrace({ log: () => {} })
    let got = null
    const factory = o => { got = o; return stub(o) }
    const words = [], phrases = []
    const l = standListen({ trace, lang: 'ru', log: () => {}, factory })({ phrases: [{ key: 'k', words: ['как', 'дела'] }], onWord: e => words.push(e), onPhrase: e => phrases.push(e) })
    expect(got.lang).toBe('ru')
    l.hear('как дела')
    expect(words.map(w => w.text)).toEqual(['как', 'дела'])
    expect(phrases).toHaveLength(1)
    expect(trace.events().filter(e => e.k === 'word')).toHaveLength(2)
    expect(trace.events().filter(e => e.k === 'phrase')).toHaveLength(1)
    l.stop()
  })
})
