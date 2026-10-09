import { describe, it, expect } from 'vitest'
import { userReply } from './sayReply.js'
import { judgeRun } from './sayResult.js'
import { readSayData } from './sayPhraseData.js'
import { emptyView } from './speechController.js'

describe('userReply — реплика ученика в чат после неудачи', () => {
  it('текст, который распознал движок: схлопнутые пробелы, первая буква заглавная', () => {
    expect(userReply({ heard: 'i am  trying ' })).toBe('I am trying')
    expect(userReply({ heard: 'Banana apple' })).toBe('Banana apple')
  })

  it('пусто / тишина / нет вердикта → null (реплики нет, только подсказка)', () => {
    expect(userReply({ heard: '' })).toBe(null)
    expect(userReply({ heard: '   ' })).toBe(null)
    expect(userReply({})).toBe(null)
    expect(userReply(null)).toBe(null)
    expect(userReply(undefined)).toBe(null)
  })

  it('берёт тот же главный вариант, по которому судили (judgeRun.heard), не дополнительные альтернативы', () => {
    const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
    const alt = text => ({ text, confidence: 0.9 })
    const view = { ...emptyView, status: 'done', runNo: 1, final: alt('banana'), alternatives: [alt('banana'), alt('i am trying to please both')] }
    expect(userReply(judgeRun(view, data))).toBe('Banana')
  })
})
