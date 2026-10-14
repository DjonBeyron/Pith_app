import { describe, it, expect } from 'vitest'
import {
  createDraft, setWeight, setEnabled, setEngine, setRule, defaultsDraft, isDirty, weightShares,
  draftWarnings, prepareSave, configDiff, exportJson, importJson, MAX_STEP,
} from './draftModel.js'
import { DEFAULT_CONFIG } from '../../../shared/lib/ranking/feedConfig.js'

describe('черновик: правки', () => {
  it('createDraft — копия, правки не трогают исходник', () => {
    const d = createDraft(DEFAULT_CONFIG)
    const d2 = setWeight(d, 'memory_fit', 80)
    expect(d.signals.memory_fit.weight).toBe(60)
    expect(d2.signals.memory_fit.weight).toBe(80)
    expect(DEFAULT_CONFIG.signals.memory_fit.weight).toBe(60)
  })

  it('вес зажат 0..100 и округлён; не-live и неизвестный id — без изменений', () => {
    const d = defaultsDraft()
    expect(setWeight(d, 'memory_fit', 250).signals.memory_fit.weight).toBe(100)
    expect(setWeight(d, 'memory_fit', -4).signals.memory_fit.weight).toBe(0)
    expect(setWeight(d, 'memory_fit', 33.6).signals.memory_fit.weight).toBe(34)
    expect(setWeight(d, 'review_urgency', 90)).toBe(d)
    expect(setWeight(d, 'nope', 90)).toBe(d)
    expect(setEnabled(d, 'review_urgency', true)).toBe(d)
  })

  it('setEnabled / setEngine / setRule', () => {
    const d = defaultsDraft()
    expect(setEnabled(d, 'random_mix', false).signals.random_mix.enabled).toBe(false)
    expect(setEngine(d, 'weighted').engine).toBe('weighted')
    expect(setEngine(d, 'garbage').engine).toBe('legacy')
    expect(setRule(d, 'exploreEvery', 99).rules.exploreEvery).toBe(30)
    expect(setRule(d, 'unknown', 3)).toBe(d)
  })

  it('isDirty — штампы версии не считаются правкой', () => {
    const base = { ...DEFAULT_CONFIG, updatedAt: '2026-10-14T10:00:00Z', updatedBy: 'a@b', note: 'x' }
    expect(isDirty(createDraft(base), base)).toBe(false)
    expect(isDirty(setWeight(createDraft(base), 'admin_order', 10), base)).toBe(true)
    expect(isDirty(setEngine(createDraft(base), 'weighted'), base)).toBe(true)
  })
})

describe('доли весов и предупреждения', () => {
  it('weightShares — сумма включённых live = 1, выключенные 0', () => {
    const d = setEnabled(defaultsDraft(), 'random_mix', false)
    const { shares, total } = weightShares(d)
    expect(total).toBe(60 + 20 + 8 + 6)
    expect(shares.random_mix).toBe(0)
    expect(shares.review_urgency).toBe(0)
    expect(Object.values(shares).reduce((a, v) => a + v, 0)).toBeCloseTo(1)
  })

  it('доминирующий сигнал > 60%', () => {
    const d = defaultsDraft() // memory_fit 60 из 97 = 62%
    const w = draftWarnings(d)
    expect(w.some(x => x.code === 'dominant' && x.id === 'memory_fit')).toBe(true)
    expect(draftWarnings(setWeight(d, 'memory_fit', 50)).some(x => x.code === 'dominant')).toBe(false)
  })

  it('все веса нулевые; weighted без live-сигналов', () => {
    let d = defaultsDraft()
    for (const id of ['memory_fit', 'quick_skip_penalty', 'difficulty_fit', 'admin_order', 'random_mix']) d = setWeight(d, id, 0)
    expect(draftWarnings(d).map(x => x.code)).toContain('all_zero')
    let off = setEngine(defaultsDraft(), 'weighted')
    for (const id of ['memory_fit', 'quick_skip_penalty', 'difficulty_fit', 'admin_order', 'random_mix']) off = setEnabled(off, id, false)
    expect(draftWarnings(off).map(x => x.code)).toContain('no_live')
    expect(draftWarnings(setEngine(off, 'legacy')).map(x => x.code)).not.toContain('no_live')
  })
})

describe('prepareSave — зажим шага', () => {
  it('скачок больше MAX_STEP зажимается и попадает в clamped', () => {
    const base = DEFAULT_CONFIG
    const d = setWeight(setWeight(defaultsDraft(), 'memory_fit', 100), 'admin_order', 20)
    const { config, clamped } = prepareSave(base, d)
    expect(config.signals.memory_fit.weight).toBe(60 + MAX_STEP)
    expect(config.signals.admin_order.weight).toBe(20) // 6 → 20 — в пределах шага
    expect(clamped).toEqual([{ id: 'memory_fit', title: 'Зона памяти', wanted: 100, got: 80 }])
  })

  it('без скачков — clamped пуст, engine сохраняется', () => {
    const d = setEngine(setWeight(defaultsDraft(), 'random_mix', 10), 'weighted')
    const { config, clamped } = prepareSave(DEFAULT_CONFIG, d)
    expect(clamped).toEqual([])
    expect(config.engine).toBe('weighted')
    expect(config.signals.random_mix.weight).toBe(10)
  })
})

describe('configDiff', () => {
  it('движок, тумблеры, веса, правила', () => {
    const a = DEFAULT_CONFIG
    const b = setRule(setEnabled(setWeight(setEngine(defaultsDraft(), 'weighted'), 'memory_fit', 70), 'random_mix', false), 'exploreEvery', 0)
    const diff = configDiff(a, b)
    expect(diff.map(x => x.kind).sort()).toEqual(['enabled', 'engine', 'rule', 'weight'])
    expect(diff.find(x => x.kind === 'weight')).toMatchObject({ id: 'memory_fit', from: 60, to: 70 })
    expect(diff.find(x => x.kind === 'rule').text).toBe('правило exploreEvery: 6 → 0')
    expect(configDiff(a, a)).toEqual([])
  })
})

describe('экспорт / импорт JSON', () => {
  it('круг: экспорт → импорт даёт тот же черновик', () => {
    const d = setEngine(setWeight(defaultsDraft(), 'memory_fit', 45), 'weighted')
    const r = importJson(exportJson(d))
    expect(r.ok).toBe(true)
    expect(isDirty(r.config, d)).toBe(false)
    expect(r.config.engine).toBe('weighted')
  })

  it('частичный signals — остальное из дефолта; штампы игнорируются', () => {
    const r = importJson('{"version":1,"engine":"weighted","signals":{"admin_order":{"enabled":true,"weight":30}},"updatedAt":"мусор","note":"из нейросети"}')
    expect(r.ok).toBe(true)
    expect(r.config.signals.admin_order.weight).toBe(30)
    expect(r.config.signals.memory_fit.weight).toBe(60)
    expect(r.config.note).toBe('из нейросети')
  })

  it('ошибки по-русски: не JSON, не объект, плохие поля', () => {
    expect(importJson('{oops').ok).toBe(false)
    expect(importJson('{oops').errors[0]).toMatch(/не JSON/)
    expect(importJson('[1,2]').errors[0]).toMatch(/объект/)
    const bad = importJson('{"version":1,"engine":"ml","signals":{"memory_fit":{"enabled":true,"weight":500},"review_urgency":{"enabled":true,"weight":5}}}')
    expect(bad.ok).toBe(false)
    expect(bad.errors.join(' ')).toMatch(/engine/)
    expect(bad.errors.join(' ')).toMatch(/memory_fit\.weight/)
    expect(bad.errors.join(' ')).toMatch(/review_urgency.*включать нельзя/)
  })
})
