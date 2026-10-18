import { describe, it, expect } from 'vitest'
import { startHintLines, startHintText, START_HINT_DELAY_MS } from './sayStartHint.js'
import { readSayData } from './sayPhraseData.js'

const d = extra => readSayData({ phrase: 'I can help you', ...extra })

describe('подсказка «начать можно так…»', () => {
  it('таймер — 10 секунд', () => { expect(START_HINT_DELAY_MS).toBe(10000) })

  it('строки из startHint ноды: по слову на строке, с переводом, пустые выброшены', () => {
    expect(startHintLines(d({ startHint: ' I — я \n\ncan — могу ' }))).toEqual(['I — я', 'can — могу'])
    expect(startHintText(d({ startHint: 'I — я\ncan — могу' }))).toBe('Начать можно так…\nI — я\ncan — могу')
  })

  it('свободная фраза без startHint: первые слова шаблона до группы или звёздочки, без перевода', () => {
    expect(startHintLines(d({ pattern: "I'm trying to **" }))).toEqual(["I'm", 'trying'])
    expect(startHintLines(d({ pattern: 'I (try|am trying) to **' }))).toEqual(['I'])
    expect(startHintLines(d({ pattern: 'I can **' }))).toEqual(['I', 'can'])
  })

  it('обычная фраза-эталон без startHint — подсказки нет (ученик повторяет за голосом)', () => {
    expect(startHintText(d())).toBeNull()
  })

  it('hintsOn: false отключает и авторскую, и автоматическую подсказку', () => {
    expect(startHintText(d({ hintsOn: false, startHint: 'I — я' }))).toBeNull()
    expect(startHintText(d({ hintsOn: false, pattern: 'I can **' }))).toBeNull()
  })

  it('не больше четырёх строк из ноды', () => {
    expect(startHintLines(d({ startHint: 'a\nb\nc\nd\ne\nf' }))).toHaveLength(4)
  })
})
