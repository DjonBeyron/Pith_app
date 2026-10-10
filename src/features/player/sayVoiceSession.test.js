import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Голосовые ответы «Сказать фразу» живут на сессию урока: пузырь хранит только voiceId (строку), клип лежит в реестре; шаг назад админа убирает голосовое вместе с пузырём,
// закрытие плеера (размонтирование usePlayerAnswers) освобождает всё. React подменён минимально: useState хранит значения в cells, useEffect запоминает cleanup.
const cells = []
let cleanups = []
vi.mock('react', async orig => {
  const real = await orig()
  return {
    ...real,
    useState: init => { const cell = { v: typeof init === 'function' ? init() : init }; cells.push(cell); return [cell.v, f => { cell.v = typeof f === 'function' ? f(cell.v) : f }] },
    useEffect: fn => { const c = fn(); if (typeof c === 'function') cleanups.push(c) },
  }
})
const { usePlayerAnswers } = await import('./usePlayerAnswers.js')
const { sayVoices, putSayVoice } = await import('../../shared/lib/speech/sayVoiceStore.js')

const PHRASE = 2 // порядок useState в usePlayerAnswers: photo, word, phrase, reg, tableSent, tableArriving
const clip = n => new Blob([new Uint8Array(n)], { type: 'audio/wav' })

describe('голосовые ответы и сессия урока', () => {
  beforeEach(() => { cells.length = 0; cleanups = []; sayVoices.clearAll() })
  afterEach(() => { sayVoices.clearAll() })

  it('пузырь получает voiceId четвёртым аргументом; без него поле не появляется (остальные модули не меняются)', () => {
    const a = usePlayerAnswers()
    const id = putSayVoice(clip(10), { durationMs: 1000, peaks: [1] })
    a.handlePhraseAnswer('n1', 'I like tea', 'wrong_final', false, id)
    a.handlePhraseAnswer('n1', 'I like tea.', 'correct', true)
    const list = cells[PHRASE].v.n1
    expect(list[0]).toEqual({ text: 'I like tea', result: 'wrong_final', voiceId: id })
    expect(list[1]).toEqual({ text: 'I like tea.', result: 'correct', arriving: true })
    // в сериализуемых данных (то, что могло бы попасть в чекпойнт) — только текст и строка-id: ни blob, ни url
    expect(JSON.stringify(list)).not.toMatch(/blob:|audio\/wav|peaks/)
  })

  it('шаг назад админа (resetNode): голосовое убирается вместе с пузырём и память освобождается; другие ноды не затронуты', () => {
    const a = usePlayerAnswers()
    const mine = [putSayVoice(clip(10)), putSayVoice(clip(10))]
    const other = putSayVoice(clip(10))
    a.handlePhraseAnswer('n1', 'one', 'wrong_final', false, mine[0])
    a.handlePhraseAnswer('n1', 'two', 'correct', true, mine[1])
    a.handlePhraseAnswer('n2', 'three', 'correct', true, other)
    a.resetNode('n1')
    expect(cells[PHRASE].v.n1).toBeUndefined()
    expect(mine.map(id => sayVoices.has(id))).toEqual([false, false])
    expect(sayVoices.has(other)).toBe(true)
    a.resetNode('n1') // повторный откат безопасен
  })

  it('закрытие урока (размонтирование плеера) освобождает все голосовые', () => {
    usePlayerAnswers()
    const ids = [putSayVoice(clip(10)), putSayVoice(clip(20))]
    expect(sayVoices.stats().clips).toBe(2)
    cleanups.forEach(fn => fn())
    expect(ids.map(id => sayVoices.has(id))).toEqual([false, false])
    expect(sayVoices.stats()).toEqual({ clips: 0, bytes: 0 })
  })
})
