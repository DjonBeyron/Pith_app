import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt, rulesSection, checklistSection, sceneSection } from './authorPrompt.js'
import { SEED_RULES } from './lessonRulesSeed.js'

const rule = (o = {}) => ({ id: 'x', text: 'Правило про сигнал.', category: 'principle', active: true, title: '', group: '', checker: 'auto', severity: 'error', bad: '', good: '', ...o })

describe('промпт для ИИ-автора', () => {
  it('в промпт попадают только активные правила, с номерами, серьёзностью и примерами; у правил линтера примеры только в full', () => {
    const { text, count } = rulesSection([rule({ checker: 'judge', bad: 'ПЛОХО', good: 'ХОРОШО' }), rule({ text: 'Выключенное', active: false })])
    expect(count).toBe(1)
    expect(text).toContain('[R1]')
    expect(text).toContain('ОШИБКА')
    expect(text).toContain('❌ НЕЛЬЗЯ:\ntext: ПЛОХО')
    expect(text).toContain('✅ МОЖНО:\ntext: ХОРОШО')
    expect(text).not.toContain('Выключенное')
    const auto = rulesSection([rule({ bad: 'ПЛОХО' })]).text
    expect(auto).not.toContain('НЕЛЬЗЯ')
    expect(rulesSection([rule({ bad: 'ПЛОХО' })], { full: true }).text).toContain('❌ НЕЛЬЗЯ:\ntext: ПЛОХО')
  })
  it('справка по модулям — отдельным разделом после легенды, не в правилах и не у судьи', () => {
    const rules = [rule({ checker: 'judge' }), rule({ category: 'reference', checker: 'manual', title: 'say_phrase: как устроен', text: 'Ученик произносит фразу' })]
    const p = buildAuthorPrompt(rules, { topic: 'x' })
    expect(rulesSection(rules).count).toBe(1)
    expect(p).toContain('СПРАВКА ПО МОДУЛЯМ')
    expect(p.indexOf('СПРАВКА ПО МОДУЛЯМ')).toBeGreaterThan(p.indexOf('ФОРМАТ НОД'))
    expect(p).toContain('• say_phrase: как устроен. Ученик произносит фразу')
    expect(buildAuthorPrompt([rule()])).not.toContain('СПРАВКА ПО МОДУЛЯМ')
  })
  it('образцы из золотого набора — по типам нод, после справки', () => {
    const ex = [{ type: 'text', kind: 'pair', before: 'Верно!', after: 'в точку))', ruleTitle: 'Тон' }, { type: 'audio', kind: 'good', after: 'кста, смотри' }]
    const p = buildAuthorPrompt([rule()], { topic: 'x', examples: ex })
    expect(p).toContain('ОБРАЗЦЫ ИЗ ЗОЛОТОГО НАБОРА')
    expect(p).toContain('### text\n❌ Верно!\n✅ в точку))\n   (Тон)')
    expect(p).toContain('### audio\n✅ кста, смотри')
    expect(buildAuthorPrompt([rule()], { topic: 'x' })).not.toContain('ОБРАЗЦЫ')
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
  it('группа «Сцены»: правила блоком в ПРАВИЛАХ, компактная легенда сцены — только когда группа активна', () => {
    const seed = SEED_RULES.map(r => ({ ...r, active: true }))
    const p = buildAuthorPrompt(seed, { topic: 'try' })
    expect(p).toContain('### Сцены')
    expect(p).toContain('S1.')
    expect(p).toContain('СЦЕНЫ В УРОКЕ')
    expect(p).toContain('# Формат сцены Pithy v2')
    expect(p).toContain('demo-pit-circle')
    expect(p).not.toContain('Пример задания «О чём диалог»') // task в сценах урока запрещён — примеры не нужны
    expect(p.indexOf('СЦЕНЫ В УРОКЕ')).toBeGreaterThan(p.indexOf('ФОРМАТ НОД'))
    const off = seed.map(r => (r.group === 'Сцены' ? { ...r, active: false } : r))
    expect(sceneSection(off)).toBe('')
    expect(buildAuthorPrompt(off)).not.toContain('СЦЕНЫ В УРОКЕ')
    expect(buildAuthorPrompt([rule()])).not.toContain('СЦЕНЫ В УРОКЕ')
  })
})
