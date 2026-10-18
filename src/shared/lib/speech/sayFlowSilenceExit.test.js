import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState, SILENCE_EXIT_AT } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'
import { HINT_SILENCE_SKIP } from './sayTexts.js'

// Две тишины подряд (ученик вообще ничего не сказал) — мягкая реплика и выход (silenceExit); подсказки выключены или речь — выхода нет
const mk = extra => readSayData({ phrase: 'I can help you', pattern: 'I can **', ...extra })
const quiet = (runNo, error = 'no-speech') => ({ ...emptyView, runNo, attempt: 1, status: 'error', error })
const say = (text, runNo) => ({ ...emptyView, runNo, attempt: 1, status: 'done', final: { text, confidence: 0.9 }, alternatives: [{ text, confidence: 0.9 }] })
const step = (s, v, data) => sayReducer(sayReducer(s, { type: 'begin', data }), { type: 'view', view: v })
const start = () => initialSayState({ action: 'listen' })

describe('мягкий выход после тишины', () => {
  it('первая тишина — обычное «не слышу вас», вторая — мягкая реплика и silenceExit', () => {
    expect(SILENCE_EXIT_AT).toBe(2)
    const data = mk()
    let s = step(start(), quiet(1), data)
    expect(s).toMatchObject({ silenceExit: false, hint: { kind: 'silence' } })
    s = step(s, quiet(2), data)
    expect(s).toMatchObject({ silenceExit: true, attempts: 0, hint: { kind: 'silenceSkip', text: HINT_SILENCE_SKIP } })
    expect(s.event.extra.hintKind).toBe('silenceSkip')
  })

  it('после выхода новая запись не начинается', () => {
    const data = mk()
    const s = step(step(start(), quiet(1), data), quiet(2), data)
    expect(sayReducer(s, { type: 'begin', data })).toBe(s)
  })

  it('речь между тишинами обрывает серию: выхода нет', () => {
    const data = mk()
    let s = step(start(), quiet(1), data)
    s = step(s, say('banana apple', 2), data)
    s = step(s, quiet(3), data)
    expect(s.silenceExit).toBe(false)
  })

  it('ошибки микрофона (не тишина) не считаются: выхода нет', () => {
    const data = mk()
    const s = step(step(start(), quiet(1, 'network'), data), quiet(2, 'network'), data)
    expect(s.silenceExit).toBe(false)
  })

  it('подсказки выключены (hintsOn: false) — выхода нет, остаётся прежний счёт тишин', () => {
    const data = mk({ hintsOn: false })
    const s = step(step(start(), quiet(1), data), quiet(2), data)
    expect(s).toMatchObject({ silenceExit: false, silences: 2, hint: null })
  })
})
