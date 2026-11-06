import { describe, it, expect } from 'vitest'
import { ruWordLine, ruVerdict, createRuJournal, VOICE_LEVEL } from './raceRuLog.js'

// Одна строка журнала на слово прохода B (русская модель): что ждали, что услышал распознаватель, заливка пилюли и итог с причиной
describe('строка журнала [ru]', () => {
  it('зачёт: слово, перевод, черновик, итог, уровень', () => {
    expect(ruWordLine({ word: 'meet', expected: 'встретить', said: { partial: 'встретить', final: '' }, level: 0.623, result: 'claim' }))
      .toBe('[ru] слово: meet ожидал: встретить услышал partial: встретить final: — уровень: 0.62 итог: зачёт')
  })
  it('причины: ошибка (что сказано), не успел с голосом и без голоса, зачёт после ошибки', () => {
    expect(ruVerdict({ result: 'fail', misses: ['я'] })).toBe('ошибка (сказано «я»)')
    expect(ruVerdict({ result: 'fail', level: VOICE_LEVEL })).toBe('не успел (голос был, слово не распознано)')
    expect(ruVerdict({ result: 'fail', level: 0.02 })).toBe('не успел (голоса не было)')
    expect(ruVerdict({ result: 'claim', misses: ['…'] })).toBe('зачёт после ошибки («…»)')
    expect(ruWordLine({ word: 'where', expected: 'где', result: 'fail' })).toMatch(/partial: — final: — уровень: — итог: не успел/)
  })
})

describe('учёт слова', () => {
  it('промахи копятся до итога слова; строка одна, потом учёт сброшен', () => {
    const j = createRuJournal()
    j.start(2); j.miss('я')
    const line = j.finish({ idx: 2, word: 'where', expected: 'где', said: { partial: 'где', final: 'где' }, level: 0.8, result: 'claim' })
    expect(line).toMatch(/итог: зачёт после ошибки \(«я»\)$/)
    expect(j.finish({ idx: 2, word: 'where', expected: 'где', result: 'fail' })).toBeNull()
  })
  it('итог чужой пилюли (другой номер) строку не пишет', () => {
    const j = createRuJournal(); j.start(1)
    expect(j.finish({ idx: 0, word: 'x', expected: 'y', result: 'fail' })).toBeNull()
    expect(j.finish({ idx: 1, word: 'x', expected: 'y', result: 'fail' })).toMatch(/^\[ru\] слово: x/)
  })
})
