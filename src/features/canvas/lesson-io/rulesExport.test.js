import { describe, it, expect } from 'vitest'
import { rulesJson } from './rulesExport.js'
import { loadRulesFromJson } from '../../../../scripts/lesson-rules.mjs'

describe('выгрузка правил для Claude (rules.json)', () => {
  it('только нужные поля, читается загрузчиком скриптов как есть', () => {
    const txt = rulesJson([{ id: '1', category: 'principle', active: true, title: 'Тире', group: 'Тон', checker: 'auto', severity: 'warn', text: 'Текст', bad: 'b', good: 'g', order: 10, extra: 'нет' }])
    const parsed = JSON.parse(txt)
    expect(parsed[0]).toEqual({ id: '1', category: 'principle', active: true, title: 'Тире', group: 'Тон', checker: 'auto', severity: 'warn', text: 'Текст', bad: 'b', good: 'g' })
    expect(loadRulesFromJson(txt).rules[0].title).toBe('Тире')
  })
})
