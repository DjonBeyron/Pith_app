import { describe, it, expect } from 'vitest'
import { SEED_RULES, SEED_META_LENGTHS } from './lessonRulesSeed.js'
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST } from './lessonRulesDefaults.js'

describe('стандартные правила для окна правил', () => {
  it('на каждое правило из кода есть строка структуры (иначе меты съедут по номерам)', () => {
    expect(SEED_META_LENGTHS.principles).toBe(PRINCIPLES.length)
    expect(SEED_META_LENGTHS.checklist).toBe(PRE_SUBMIT_CHECKLIST.length)
  })
  it('у каждого правила есть название, группа, допустимые проверка и серьёзность', () => {
    for (const r of SEED_RULES) {
      expect(r.title, r.text.slice(0, 40)).not.toBe('')
      expect(r.group).not.toBe('')
      expect(['auto', 'judge', 'manual']).toContain(r.checker)
      expect(['error', 'warn']).toContain(r.severity)
    }
  })
  it('группа «Сцены»: S1–S8 по порядку, у каждой S-код в тексте, проверка и серьёзность по плану', () => {
    const sc = SEED_RULES.filter(r => r.group === 'Сцены')
    expect(sc.map(r => r.text.slice(0, 10))).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => `Сцены, S${n}.`))
    expect(sc.map(r => `${r.checker}/${r.severity}`)).toEqual(['auto/error', 'auto/error', 'auto/warn', 'auto/error', 'judge/warn', 'judge/warn', 'auto/error', 'auto/warn'])
    for (const r of sc) { expect(r.category).toBe('principle'); expect(r.bad).not.toBe(''); expect(r.good).not.toBe('') }
  })
})
