import { describe, it, expect } from 'vitest'
import { sameFamily, diffTexts, buildChain, analyzeChain } from './attemptDiff.js'

const REF = "I'm trying"
const chain = (...items) => items.map((x, i) => (typeof x === 'string' ? { t: 1000 * (i + 1), text: x } : x))

describe('sameFamily: слова одной «семьи»', () => {
  it('общий префикс ≥ 3: try / trying / tried / tries', () => {
    for (const w of ['trying', 'tried', 'tries']) expect(sameFamily('try', w)).toBe(true)
  })
  it('основа + окончание: go / goes, run / running', () => {
    expect(sameFamily('go', 'goes')).toBe(true)
    expect(sameFamily('run', 'running')).toBe(true)
  })
  it('Левенштейн ≤ 3: слова от 4 букв (или от 3 с общим началом); короткие не склеиваем', () => {
    expect(sameFamily('went', 'want')).toBe(true)
    expect(sameFamily('to', 'do')).toBe(false)
    expect(sameFamily('am', 'is')).toBe(false)
    expect(sameFamily('please', 'both')).toBe(false)
  })
})

describe('diffTexts: пословный diff в обе стороны', () => {
  it('замена окончания: try → trying', () => {
    expect(diffTexts("I'm try", "I'm trying")).toEqual([{ kind: 'replace', from: 'try', to: 'trying' }])
  })
  it('обратная замена: trying → try', () => {
    expect(diffTexts("I'm trying", "I'm try")).toEqual([{ kind: 'replace', from: 'trying', to: 'try' }])
  })
  it('дописано в конце — отдельный вид, не замена', () => {
    expect(diffTexts("I'm try", "I'm try to please")).toEqual([{ kind: 'append', to: 'to please' }])
  })
  it('замена и дописывание вместе (разная длина)', () => {
    expect(diffTexts("I'm try", "I'm trying to please")).toEqual([
      { kind: 'replace', from: 'try', to: 'trying' }, { kind: 'append', to: 'to please' },
    ])
  })
  it('вставка и удаление в середине', () => {
    expect(diffTexts('I want to go home', 'I want go home')).toEqual([{ kind: 'remove', from: 'to' }])
    expect(diffTexts('I want go home', 'I want to go home')).toEqual([{ kind: 'insert', to: 'to' }])
  })
  it('одинаковые тексты (в т.ч. «I\'m» = «I am», регистр) → пусто', () => {
    expect(diffTexts("I'm trying", 'I am Trying')).toEqual([])
    expect(diffTexts('', '')).toEqual([])
  })
})

describe('buildChain', () => {
  it('interim из истории + итог; метка final берёт время из истории', () => {
    const c = buildChain({ history: [{ t: 400, text: 'I am' }, { t: 900, text: 'I am try' }, { t: 1500, text: 'I am trying', final: true }], final: { text: 'I am trying' } })
    expect(c).toEqual([{ t: 400, text: 'I am' }, { t: 900, text: 'I am try' }, { t: 1500, text: 'I am trying', final: true }])
  })
  it('нет истории — единственный interim берём из lastInterim; нет interim вовсе — только итог', () => {
    expect(buildChain({ history: [], final: { text: 'a b' }, lastInterim: 'a' })).toEqual([{ t: null, text: 'a' }, { t: null, text: 'a b', final: true }])
    expect(buildChain({ history: [], final: { text: 'a b' } })).toEqual([{ t: null, text: 'a b', final: true }])
  })
})

describe('analyzeChain: «исправил ли движок» (фикстуры)', () => {
  it('[«I\'m try» → «I\'m trying»] — исправлено в ходе речи (interim→interim), к эталону', () => {
    const r = analyzeChain(chain("I'm try", "I'm trying", { t: 3000, text: "I'm trying", final: true }), REF)
    expect(r.engineFixed).toBe(true)
    expect(r.dir).toBe('toRef')
    expect(r.reverse).toBe(false)
    expect(r.changes).toEqual([{ kind: 'replace', from: 'try', to: 'trying', at: 2000, step: 'interim→interim', idx: 1, dir: 'toRef', family: true }])
  })
  it('[interim «I\'m trying», final «I\'m try»] — ОБРАТНОЕ исправление (interim→final)', () => {
    const r = analyzeChain(chain("I'm trying", { t: 2500, text: "I'm try", final: true }), REF)
    expect(r.engineFixed).toBe(true)
    expect(r.reverse).toBe(true)
    expect(r.dir).toBe('fromRef')
    expect(r.fixed[0]).toMatchObject({ from: 'trying', to: 'try', at: 2500, step: 'interim→final' })
  })
  it('[«I\'m try» → final «I\'m trying»] — исправление только в итоге', () => {
    const r = analyzeChain(chain("I'm try", { t: 1800, text: "I'm trying", final: true }), REF)
    expect(r.fixed.map(c => c.step)).toEqual(['interim→final'])
  })
  it('[одинаковые тексты] — исправления нет', () => {
    const r = analyzeChain(chain("I'm trying", "I'm trying", { t: 3000, text: "I'm trying", final: true }), REF)
    expect(r).toMatchObject({ engineFixed: false, changes: [], dir: null, reverse: false })
  })
  it('обычный рост фразы и «дописано в конце» исправлением не считаются', () => {
    const r = analyzeChain(chain("I'm", "I'm try", { t: 3000, text: "I'm try to please", final: true }), REF)
    expect(r.engineFixed).toBe(false)
    expect(r.appended).toEqual(['try', 'to please'])
  })
  it('замена слова вне «семьи» эталона — не исправление (please → peace при эталоне «I\'m trying»)', () => {
    const r = analyzeChain(chain("I'm trying to please", { t: 3000, text: "I'm trying to peace", final: true }), "I'm trying")
    expect(r.changes.map(c => c.kind)).toEqual(['replace'])
    expect(r.engineFixed).toBe(false)
  })
  it('только итог без interim — сравнивать не с чем', () => {
    expect(analyzeChain([{ t: 900, text: "I'm trying", final: true }], REF)).toMatchObject({ engineFixed: false, changes: [] })
  })
})
