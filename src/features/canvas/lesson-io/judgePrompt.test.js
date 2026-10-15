import { describe, it, expect } from 'vitest'
import { buildJudgePrompt, parseVerdict, judgeRules } from './judgePrompt.js'
import { SEED_RULES } from './lessonRulesSeed.js'

const rule = (o = {}) => ({ id: 'x', text: 'Правило.', category: 'principle', active: true, title: '', group: '', checker: 'judge', severity: 'warn', bad: '', good: '', ...o })

describe('ИИ-судья', () => {
  it('правила, которые целиком проверяет линтер, судье не отдаём', () => {
    expect(judgeRules([rule(), rule({ checker: 'auto' })])).toHaveLength(1)
  })
  it('промпт содержит правила и урок', () => {
    const p = buildJudgePrompt([rule({ text: 'Текст правила' })], { nodes: [1] })
    expect(p).toContain('[R1]')
    expect(p).toContain('Текст правила')
    expect(p).toContain('{"nodes":[1]}')
  })
  it('вердикт: нарушения достаются даже из ответа с обёрткой', () => {
    const a = 'Вот:\n```json\n[{"rule":"R1","ok":true},{"rule":"R2","ok":false,"nodes":["n3"],"fix":"x"}]\n```'
    expect(parseVerdict(a).violations.map(v => v.rule)).toEqual(['R2'])
    expect(parseVerdict('ничего').ok).toBe(false)
  })
  it('правила «Сцены» S5–S6 (checker judge) уходят судье, авто-правила S1–S4, S7, S8 — нет', () => {
    const p = buildJudgePrompt(SEED_RULES.map(r => ({ ...r, active: true })), { nodes: [] })
    expect(p).toContain('Сцены, S5.')
    expect(p).toContain('Сцены, S6.')
    for (const s of ['S1', 'S2', 'S3', 'S4', 'S7', 'S8']) expect(p).not.toContain(`Сцены, ${s}.`)
  })
})
