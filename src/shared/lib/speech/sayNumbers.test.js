import { describe, it, expect } from 'vitest'
import { tokenize, matchPhrase } from './speechMatch.js'
import { judgeRun } from './sayResult.js'
import { pickReference } from './sayReading.js'
import { readSayData } from './sayPhraseData.js'
import { buildSayGrammar } from '../vosk/sayVoskGrammar.js'
import { cleanResult } from '../vosk/voskResult.js'

// Числа в оценке: эталон с цифрой и услышанное словами (Vosk) / цифрами (системное) приводятся к одной форме
const view = text => ({ status: 'done', final: { text, confidence: 0.9 }, alternatives: [{ text }], lastInterim: text, history: [] })
const verdict = (phrase, heard, over = {}) => judgeRun(view(heard), readSayData({ phrase, ...over }))

describe('tokenize: простые числа становятся словами', () => {
  it('цифры ↔ слова: «2» и «two» — одно слово; сложные числа остаются как были', () => {
    expect(tokenize('I have 2 cats')).toEqual(['i', 'have', 'two', 'cats'])
    expect(tokenize('i have two cats')).toEqual(['i', 'have', 'two', 'cats'])
    expect(tokenize('on the 21st')).toEqual(['on', 'the', 'twenty', 'first'])
    expect(tokenize('It is 2.5')).toEqual(['it', 'is', '2', '5']) // как и раньше: непростое число не трогаем
    expect(tokenize('Hello, world!')).toEqual(['hello', 'world']) // без цифр — без изменений
  })
  it('matchPhrase: эталон с цифрой и услышанное словами совпадают, и наоборот', () => {
    expect(matchPhrase('I have 2 cats', 'i have two cats').ratio).toBe(1)
    expect(matchPhrase('I have two cats', 'I have 2 cats').ratio).toBe(1)
    expect(matchPhrase('I have 2 cats', 'I have 3 cats').ratio).toBeLessThan(1)
  })
})

describe('judgeRun: числа от Vosk (слова) и системного (цифры)', () => {
  it('«I have 2 cats»: Vosk сказал «i have two cats», системное — «I have 2 cats»: оба засчитаны', () => {
    expect(verdict('I have 2 cats', 'i have two cats').passed).toBe(true)
    expect(verdict('I have 2 cats', 'I have 2 cats').passed).toBe(true)
    expect(verdict('I have 2 cats', 'i have three cats', { strict: true }).passed).toBe(false)
  })
  it('год: «1998» принимается и как «nineteen ninety eight», и как «one thousand nine hundred ninety eight»', () => {
    for (const heard of ['it was nineteen ninety eight', 'it was one thousand nine hundred ninety eight', 'it was one thousand nine hundred and ninety eight', 'It was 1998']) {
      expect(verdict('It was 1998', heard, { strict: true }).passed, heard).toBe(true)
    }
    expect(verdict('It was 1998', 'it was nineteen ninety nine', { strict: true }).passed).toBe(false)
  })
  it('«0»: zero и oh; сотни с «and» и без; эталон словами и системное с цифрами', () => {
    expect(verdict('I have 0 cats', 'i have oh cats', { strict: true }).passed).toBe(true)
    expect(verdict('I have 0 cats', 'i have zero cats', { strict: true }).passed).toBe(true)
    expect(verdict('Room 105', 'room one hundred and five', { strict: true }).passed).toBe(true)
    expect(verdict('It was nineteen ninety eight', 'It was 1998', { strict: true }).passed).toBe(true)
    expect(verdict('It was one thousand nine hundred ninety eight', 'It was 1998', { strict: true }).passed).toBe(false) // известное ограничение: системное «1998» читаем как год
  })
  it('порядковые, проценты, время: «21st» ↔ «twenty first», «50%» ↔ «fifty percent», «3:30» ↔ «three thirty»', () => {
    expect(verdict('On the 21st', 'on the twenty first', { strict: true }).passed).toBe(true)
    expect(verdict('50% off', 'fifty percent off', { strict: true }).passed).toBe(true)
    expect(verdict('At 3:30', 'at three thirty', { strict: true }).passed).toBe(true)
    expect(verdict('At 3:30', 'at 3:30', { strict: true }).passed).toBe(true)
  })
  it('ключевое слово-число: keywords «2» ловит слово «two»', () => {
    expect(verdict('I have 2 cats', 'i have cats', { keywords: '2' }).passed).toBe(false)
    expect(verdict('I have 2 cats', 'i have two cats', { keywords: '2' }).passed).toBe(true)
  })
  it('pickReference: без цифр — фраза как есть; с несколькими прочтениями — лучшее совпавшее, при равенстве основное', () => {
    expect(pickReference('Hello there', 'hello')).toBe('Hello there')
    expect(pickReference('It was 1998', 'it was nineteen ninety eight')).toBe('It was nineteen ninety eight')
    expect(pickReference('It was 1998', 'it was one thousand nine hundred ninety eight')).toBe('It was one thousand nine hundred ninety eight')
    expect(pickReference('It was 1998', '')).toBe('It was nineteen ninety eight')
    expect(pickReference('Room 2.5', 'room')).toBe('Room 2.5') // непростое — как есть
  })
})

describe('цепочка Vosk: словарь → слова → оценка', () => {
  it('всё, что Vosk может вернуть из словаря «I have 2 cats», засчитывается; цифр в словаре нет', () => {
    const data = readSayData({ phrase: 'I have 2 cats and 1998' })
    const g = buildSayGrammar(data)
    expect(g.json).not.toMatch(/\d/)
    const right = JSON.parse(g.json).filter(l => l !== '[unk]').slice(0, 2) // «i have two cats and nineteen…» в двух записях
    for (const line of right) {
      const text = cleanResult({ text: line, words: line.split(' ').map(word => ({ word, conf: 0.9 })), minConf: 0.5 }).text
      expect(judgeRun(view(text), { ...data, strict: true, passRatio: 1 }).passed, line).toBe(true)
    }
  })
})
