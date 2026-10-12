import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt, rulesSection, checklistSection } from './authorPrompt.js'

const rule = (o = {}) => ({ id: 'x', text: 'Правило про сигнал.', category: 'principle', active: true, title: '', group: '', checker: 'auto', severity: 'error', bad: '', good: '', ...o })

describe('промпт для ИИ-автора', () => {
  it('в промпт попадают только активные правила, с номерами, серьёзностью и примерами', () => {
    const { text, count } = rulesSection([rule({ bad: 'ПЛОХО', good: 'ХОРОШО' }), rule({ text: 'Выключенное', active: false })])
    expect(count).toBe(1)
    expect(text).toContain('[R1]')
    expect(text).toContain('ОШИБКА')
    expect(text).toContain('❌ НЕЛЬЗЯ:\ntext: ПЛОХО')
    expect(text).toContain('✅ МОЖНО:\ntext: ХОРОШО')
    expect(text).not.toContain('Выключенное')
  })
  it('чек-лист отдельно; тема, формула и процесс на месте; принципы легенды не дублируются', () => {
    const rules = [rule(), rule({ category: 'checklist', text: 'Пройди по уроку целиком' })]
    expect(checklistSection(rules)).toBe('C1. Пройди по уроку целиком')
    const p = buildAuthorPrompt(rules, { topic: 'To be' })
    expect(p).toContain('ТЕМА УРОКА: To be')
    expect(p).toContain('ГЛАВНАЯ ФОРМУЛА')
    expect(p).toContain('ПРОЦЕСС')
    expect(p).toContain('"nodes"')
    expect(p).not.toContain('"principles"')
    expect(p).not.toContain('"preSubmitChecklist"')
  })
  it('без темы — заглушка для вставки', () => {
    expect(buildAuthorPrompt([rule()])).toContain('<впиши тему')
  })
})
