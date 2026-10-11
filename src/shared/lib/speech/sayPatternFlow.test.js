import { describe, it, expect } from 'vitest'
import { readSayData } from './sayPhraseData.js'
import { judgeRun } from './sayResult.js'
import { successReply } from './sayReply.js'
import { pickEngine } from './sayEnginePick.js'
import { buildHint } from './sayHints.js'

const view = text => ({ final: { text }, alternatives: [{ text }], lastInterim: text, history: [] })
const free = { phrase: 'I try to wake up early', pattern: 'I (try|am trying) to **' }

describe('«Сказать фразу» со свободной фразой (pattern)', () => {
  it('readSayData: шаблон читается; битый шаблон игнорируется (проверка по эталону)', () => {
    expect(readSayData(free).pattern).toBe('I (try|am trying) to **')
    expect(readSayData({ phrase: 'Hello there', pattern: 'I (try' }).pattern).toBe('')
    expect(readSayData({ phrase: 'Hello there' }).pattern).toBe('')
  })

  it('judgeRun: своя концовка засчитывается, другое время нет; в вердикте то, что услышано', () => {
    const data = readSayData(free)
    const good = judgeRun(view('I am trying to relax'), data)
    expect(good).toMatchObject({ passed: true, ratioPct: 100, heard: 'I am trying to relax', pattern: true })
    expect(judgeRun(view('I tried to relax'), data).passed).toBe(false)
  })

  it('реплика в чат при успехе — сказанное учеником, а не пример-эталон', () => {
    const data = readSayData(free)
    expect(successReply(judgeRun(view('i try to read books'), data), data.phrase)).toBe('I try to read books')
  })

  it('«Почти!»: подсказка называет слова шаблона, которых не хватило', () => {
    const data = readSayData({ ...free, hintPartial: 'Почти! Верно: {ok}. Не хватило: {missed}.' })
    const v = judgeRun(view('I try relax'), data)
    expect(buildHint(data, { verdict: v })).toEqual({ kind: 'partial', text: 'Почти! Верно: I, try. Не хватило: to.' })
  })

  it('движок: свободная фраза всегда идёт на системное распознавание, обычная при готовом Vosk — на Vosk', () => {
    const ready = { cached: true, loaded: true, libReady: true }
    expect(pickEngine({ phrase: free.phrase, free: true, ...ready })).toEqual({ engine: 'system', reason: 'free' })
    expect(pickEngine({ phrase: free.phrase, ...ready })).toEqual({ engine: 'vosk', reason: 'ready' })
  })
})
