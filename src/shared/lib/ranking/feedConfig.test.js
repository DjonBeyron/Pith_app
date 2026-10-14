import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig, validateConfig, clampStep, clampConfigStep, activeWeights } from './feedConfig.js'
import { SIGNALS, liveSignals } from './signalRegistry.js'

describe('normalizeConfig — устойчивость к мусору', () => {
  it('не-объект / null / старая версия → дефолт (legacy)', () => {
    for (const raw of [null, undefined, 42, 'str', [], { version: 0, engine: 'ml' }]) {
      const cfg = normalizeConfig(raw)
      expect(cfg.engine).toBe('legacy')
      expect(cfg.version).toBe(1)
      expect(Object.keys(cfg.signals).sort()).toEqual(SIGNALS.map(s => s.id).sort())
      expect(cfg.rules).toEqual(DEFAULT_CONFIG.rules)
    }
  })

  it('неизвестные id отброшены, веса зажаты 0..100 и округлены, не-live не включить', () => {
    const cfg = normalizeConfig({
      engine: 'weighted',
      signals: { memory_fit: { enabled: true, weight: 250.7 }, admin_order: { enabled: false, weight: -5 }, bogus: { enabled: true, weight: 50 }, review_urgency: { enabled: true, weight: 'x' }, random_mix: 'мусор' },
      rules: { exploreEvery: 99, maxSameTypeInRow: -1, unknown: 3 },
      note: 123, updatedAt: 5,
    })
    expect(cfg.engine).toBe('weighted')
    expect(cfg.signals.bogus).toBeUndefined()
    expect(cfg.signals.memory_fit).toEqual({ enabled: true, weight: 100 })
    expect(cfg.signals.admin_order).toEqual({ enabled: false, weight: 0 })
    expect(cfg.signals.review_urgency.enabled).toBe(false)
    expect(cfg.signals.review_urgency.weight).toBe(25)
    expect(cfg.signals.random_mix).toEqual({ enabled: true, weight: 3 })
    expect(cfg.rules).toEqual({ exploreEvery: 30, maxSameTypeInRow: 0 })
    expect(cfg.note).toBe('')
    expect(cfg.updatedAt).toBe(null)
  })

  it('идемпотентна и совпадает с DEFAULT_CONFIG на дефолте', () => {
    const a = normalizeConfig(DEFAULT_CONFIG)
    expect(normalizeConfig(a)).toEqual(a)
    expect(a).toEqual(DEFAULT_CONFIG)
  })
})

describe('validateConfig', () => {
  it('дефолт валиден', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual({ ok: true, errors: [] })
  })
  it('перечисляет ошибки по-русски, не чинит', () => {
    const { ok, errors } = validateConfig({ version: 2, engine: 'x', signals: { memory_fit: { enabled: 'y', weight: 101 }, nope: {}, review_urgency: { enabled: true, weight: 1 } }, rules: { exploreEvery: 1.5, zzz: 1 } })
    expect(ok).toBe(false)
    expect(errors.join('\n')).toMatch(/version/)
    expect(errors.join('\n')).toMatch(/engine/)
    expect(errors.join('\n')).toMatch(/memory_fit\.enabled/)
    expect(errors.join('\n')).toMatch(/memory_fit\.weight/)
    expect(errors.join('\n')).toMatch(/неизвестный сигнал nope/)
    expect(errors.join('\n')).toMatch(/review_urgency.*включать нельзя/)
    expect(errors.join('\n')).toMatch(/exploreEvery/)
    expect(errors.join('\n')).toMatch(/неизвестное правило zzz/)
  })
  it('не-объект', () => {
    expect(validateConfig('x').ok).toBe(false)
  })
})

describe('clampStep — защита от резких скачков', () => {
  it('не дальше maxStep от прежнего, в пределах 0..100', () => {
    expect(clampStep(50, 90)).toBe(70)
    expect(clampStep(50, 10)).toBe(30)
    expect(clampStep(50, 55)).toBe(55)
    expect(clampStep(95, 200, 20)).toBe(100)
    expect(clampStep(5, -50, 20)).toBe(0)
    expect(clampStep(50, 80, 50)).toBe(80)
    expect(clampStep('мусор', 'мусор')).toBe(0)
  })
  it('clampConfigStep применяет к каждому весу', () => {
    const prev = normalizeConfig(DEFAULT_CONFIG)
    const next = normalizeConfig({ signals: { memory_fit: { enabled: true, weight: 0 }, admin_order: { enabled: true, weight: 100 } } })
    const out = clampConfigStep(prev, next)
    expect(out.signals.memory_fit.weight).toBe(40)
    expect(out.signals.admin_order.weight).toBe(26)
  })
})

describe('activeWeights', () => {
  it('включённые live-сигналы, сумма весов = 1', () => {
    const w = activeWeights(DEFAULT_CONFIG)
    expect([...w.keys()].sort()).toEqual(liveSignals().map(s => s.id).sort())
    expect([...w.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
  it('все веса 0 → пусто', () => {
    const sig = Object.fromEntries(SIGNALS.map(s => [s.id, { enabled: true, weight: 0 }]))
    expect(activeWeights({ signals: sig }).size).toBe(0)
  })
})
