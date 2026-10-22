import { describe, it, expect } from 'vitest'
import { SEED_RULES, SEED_GROUP_ORDER, RETIRED_TITLES } from './lessonRulesSeed.js'
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST, REFERENCE_NOTES } from './lessonRulesDefaults.js'

describe('стандартные правила для окна правил', () => {
  it('тексты легенды — производные от набора: принципы, чек-лист, справка', () => {
    expect(PRINCIPLES).toEqual(SEED_RULES.filter(r => r.category === 'principle').map(r => r.text))
    expect(PRE_SUBMIT_CHECKLIST).toEqual(SEED_RULES.filter(r => r.category === 'checklist').map(r => r.text))
    expect(REFERENCE_NOTES).toEqual(SEED_RULES.filter(r => r.category === 'reference').map(r => r.text))
    expect(PRINCIPLES.length).toBeGreaterThan(80)
    expect(PRE_SUBMIT_CHECKLIST.length).toBeGreaterThan(5)
  })
  it('у каждого правила есть название, группа, допустимые проверка и серьёзность; справка — manual', () => {
    for (const r of SEED_RULES) {
      expect(r.title, r.text.slice(0, 40)).not.toBe('')
      expect(SEED_GROUP_ORDER).toContain(r.group)
      expect(['auto', 'judge', 'manual']).toContain(r.checker)
      expect(['error', 'warn']).toContain(r.severity)
      if (r.category === 'reference') expect(r.checker).toBe('manual')
    }
  })
  it('названия уникальны, снятые названия не пересекаются с действующими', () => {
    const titles = SEED_RULES.map(r => r.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(RETIRED_TITLES.filter(t => titles.includes(t))).toEqual([])
    expect(new Set(RETIRED_TITLES).size).toBe(RETIRED_TITLES.length)
  })
  it('группа «Сцены»: S1–S8 по порядку, у каждой S-код в тексте, проверка и серьёзность по плану', () => {
    const sc = SEED_RULES.filter(r => r.group === 'Сцены')
    expect(sc.map(r => r.text.slice(0, 10))).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => `Сцены, S${n}.`))
    expect(sc.map(r => `${r.checker}/${r.severity}`)).toEqual(['auto/error', 'auto/error', 'auto/warn', 'auto/error', 'judge/warn', 'judge/warn', 'auto/error', 'auto/warn'])
    for (const r of sc) { expect(r.category).toBe('principle'); expect(r.bad).not.toBe(''); expect(r.good).not.toBe('') }
  })
})
