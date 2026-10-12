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
})
