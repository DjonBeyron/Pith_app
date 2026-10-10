import { describe, it, expect } from 'vitest'
import { userReply, successReply } from './sayReply.js'
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

describe('successReply — реплика ученика в чат при успехе', () => {
  const data = readSayData({ phrase: "I'm trying to please both", threshold: 70 })
  const verdictFor = text => judgeRun({ ...emptyView, status: 'done', runNo: 1, final: { text, confidence: 0.9 }, alternatives: [{ text, confidence: 0.9 }], lastInterim: text }, data)

  it('все слова эталона услышаны → эталон как был', () => {
    const v = verdictFor("i'm trying to please both")
    expect(v.passed).toBe(true); expect(successReply(v, data.phrase)).toBe("I'm trying to please both")
    expect(successReply(verdictFor('i am trying to please both'), data.phrase)).toBe("I'm trying to please both") // «i'm» = «i am»
  })
  it('«both» не услышано, но порог 70% пройден (5 из 6 = 83%) → в чат то, что услышано, а не эталон', () => {
    const v = verdictFor("i'm trying to please")
    expect(v.passed).toBe(true); expect(v.missed).toEqual(['both']); expect(v.ratioPct).toBe(83)
    expect(successReply(v, data.phrase)).toBe("I'm trying to please")
  })
  it('нет вердикта (админская палочка, пропуск) или услышанного текста нет → эталон', () => {
    expect(successReply(null, data.phrase)).toBe(data.phrase)
    expect(successReply({ missed: ['both'], heard: '' }, data.phrase)).toBe(data.phrase)
    expect(successReply({}, data.phrase)).toBe(data.phrase)
  })
})
