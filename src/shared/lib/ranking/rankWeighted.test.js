import { describe, it, expect } from 'vitest'
import { rankModules, rankModulesOrder, explainModule } from './rankWeighted.js'
import { applyMaxSameTypeInRow, applyExploreSlots } from './rankRules.js'
import { normalizeConfig, DEFAULT_CONFIG } from './feedConfig.js'

// Синтетика: analyze даёт слова/память напрямую — без feedKnowledge
const KNOW = { shaky: ['to'], newWords: [] }
const ALLNEW = w => ({ shaky: [], newWords: w })
const mods = [
  { id: 'A', difficulty: 3, difficultyVotes: 9, words: ['x', 'y'], info: ALLNEW(['x', 'y']) },
  { id: 'B', difficulty: 1, difficultyVotes: 9, words: ['to', 'go'], info: KNOW },
  { id: 'C', difficulty: 1, difficultyVotes: 0, words: [], info: { shaky: [], newWords: [] } },
  { id: 'D', difficulty: 1, difficultyVotes: 9, words: ['q'], info: ALLNEW(['q']) },
]
const ctx = (extra = {}) => ({
  stepOf: new Map([['to', 1]]),
  skipped: new Set(),
  seed: 11,
  analyze: m => ({ words: m.words, info: { total: m.words.length, ...m.info } }),
  ...extra,
})
const weighted = (signals = {}, rules = {}) => normalizeConfig({ engine: 'weighted', signals: { ...DEFAULT_CONFIG.signals, ...signals }, rules: { exploreEvery: 0, ...rules } })
const ids = r => r.map(x => (x.module ?? x).id)

describe('rankModules', () => {
  it('веса по умолчанию: зона памяти → без слов → все новые (проще раньше)', () => {
    expect(ids(rankModules(mods, ctx(), weighted()))).toEqual(['B', 'C', 'D', 'A'])
  })

  it('выключение сигнала меняет порядок', () => {
    const off = weighted({ memory_fit: { enabled: false, weight: 60 }, difficulty_fit: { enabled: false, weight: 6 }, random_mix: { enabled: false, weight: 3 } })
    expect(ids(rankModules(mods, ctx(), off))).toEqual(['A', 'B', 'C', 'D']) // остался порядок админа
  })

  it('вес меняет порядок', () => {
    const adminHeavy = weighted({ admin_order: { enabled: true, weight: 100 }, memory_fit: { enabled: true, weight: 5 }, random_mix: { enabled: false, weight: 0 } })
    expect(ids(rankModules(mods, ctx(), adminHeavy))[0]).toBe('A')
  })

  it('сумма весов нормализована: score ∈ 0..1, parts дают score', () => {
    for (const r of rankModules(mods, ctx(), weighted())) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
      expect(r.parts.reduce((a, p) => a + p.weight, 0)).toBeCloseTo(1, 10)
      expect(r.parts.reduce((a, p) => a + p.contribution, 0)).toBeCloseTo(r.score, 10)
      expect(r.reasons.length).toBeGreaterThan(0)
      expect(r.reasons.length).toBeLessThanOrEqual(3)
    }
  })

  it('детерминированность по сиду; другой сид — другой жребий', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, difficulty: 1, difficultyVotes: 0, words: ['z'], info: ALLNEW(['z']) }))
    const a = ids(rankModules(many, ctx({ seed: 3 }), weighted({}, { exploreEvery: 6 })))
    const b = ids(rankModules(many, ctx({ seed: 3 }), weighted({}, { exploreEvery: 6 })))
    const c = ids(rankModules(many, ctx({ seed: 4 }), weighted({}, { exploreEvery: 6 })))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(new Set(a).size).toBe(20)
  })

  it('пролист: сама фраза и похожая — ниже', () => {
    const similar = { id: 'E', difficulty: 1, difficultyVotes: 9, words: ['to', 'zz'], info: { shaky: ['to'], newWords: ['zz'] } }
    const score = (list, skipped, id) => rankModules(list, ctx({ skipped }), weighted()).find(r => r.module.id === id).score
    const list = [...mods, similar]
    expect(score(list, new Set(['B']), 'B')).toBeLessThan(score(list, new Set(), 'B'))
    expect(score(list, new Set(['B']), 'E')).toBeLessThan(score(list, new Set(), 'E'))
    expect(score(list, new Set(['B']), 'C')).toBe(score(list, new Set(), 'C'))
    // Пролист = один шаг зоны памяти (как +1 tier в legacy): B остаётся выше фразы без слов
    expect(ids(rankModules(list, ctx({ skipped: new Set(['B']) }), weighted())).indexOf('B')).toBeLessThan(ids(rankModules(list, ctx({ skipped: new Set(['B']) }), weighted())).indexOf('C'))
  })

  it('холодный старт (память пуста / нет analyze / пустой список) не падает', () => {
    const cold = rankModules(mods, { stepOf: new Map() }, weighted())
    expect(ids(cold).sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(cold.every(r => r.parts.find(p => p.id === 'memory_fit').reason === 'память пуста')).toBe(true)
    expect(rankModules([], {}, weighted())).toEqual([])
    expect(rankModules(mods, {}, null).length).toBe(4)
    expect(rankModulesOrder(mods, undefined, undefined).length).toBe(4)
  })

  it('все веса 0 → порядок админа', () => {
    const zero = normalizeConfig({ engine: 'weighted', signals: Object.fromEntries(Object.keys(DEFAULT_CONFIG.signals).map(k => [k, { enabled: true, weight: 0 }])), rules: { exploreEvery: 0 } })
    expect(ids(rankModules(mods, ctx(), zero))).toEqual(['A', 'B', 'C', 'D'])
  })

  it('explainModule — позиция и вклады', () => {
    const r = rankModules(mods, ctx(), weighted())
    expect(explainModule(r, 'B').position).toBe(1)
    expect(explainModule(r, 'nope')).toBe(null)
  })
})

describe('правила', () => {
  const row = (id, type) => ({ module: { id, type }, reasons: [] })
  it('maxSameTypeInRow: без типов пропускается, с типами разбавляет', () => {
    expect(applyMaxSameTypeInRow([row('a'), row('b')], 2).applied).toBe(false)
    const r = applyMaxSameTypeInRow([row('a', 'v'), row('b', 'v'), row('c', 'v'), row('d', 's'), row('e', 'v')], 2)
    expect(r.applied).toBe(true)
    expect(ids(r.ranked)).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(r.ranked[2].reasons).toContain('разбавляет серию одного типа')
  })
  it('exploreEvery: каждая N-я — из хвоста, выкл при 0', () => {
    const list = Array.from({ length: 13 }, (_, i) => row(`m${i}`))
    expect(applyExploreSlots(list, 0, 1)).toBe(list)
    const out = applyExploreSlots(list, 6, 1)
    expect(ids(out).slice(0, 5)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])
    expect(out[5].module.id).not.toBe('m5')
    expect(new Set(ids(out)).size).toBe(13)
  })
})
