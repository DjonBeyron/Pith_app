import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

// Подсказки в чат в автомате панели (state.hint): тип по неудаче, номер, снятие, hintsOn, свой текст. Остальной автомат — sayFlow.test.js
const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, extra = {}) => ({ ...emptyView, status: 'done', runNo: 1, attempt: 1, final: alt(text), alternatives: [alt(text)], ...extra })
const run = () => sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data })

describe('подсказки в чат: state.hint по типу неудачи (sayHints.js)', () => {
  const fail = (s, view) => sayReducer(s, { type: 'view', view })
  const begin = d => sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data: d })

  it('тишина → silence, не то → mismatch, почти → partial с {ok}/{missed}; у каждой неудачи свой номер n; в событии hint_kind-источник hintKind', () => {
    const quiet = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'no-speech' })
    expect(quiet.hint).toMatchObject({ kind: 'silence', n: 1, text: 'Не слышу вас. Говорите громче и ближе к микрофону.' })
    expect(quiet.event.extra.hintKind).toBe('silence')
    const wrong = fail(run(), done('banana apple'))
    expect(wrong.hint).toMatchObject({ kind: 'mismatch', text: 'Не совсем. Попробуйте ещё раз, чуть медленнее.' })
    const almost = fail(run(), done('I am trying'))
    expect(almost.hint.kind).toBe('partial')
    expect(almost.hint.text).toBe('Почти! Верно: I, am, trying. Не хватило: to, please, both.')
    const again = fail(sayReducer(almost, { type: 'begin', data }), done('banana', { runNo: 2 }))
    expect(again.hint.n).toBe(2)
    expect(again.event.extra.hintKind).toBe('mismatch')
  })

  it('начало новой попытки и успех подсказку снимают; сетевой сбой — «не слышу»; системные ошибки, требующие действия, подсказки не дают', () => {
    const failed = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'network', attempt: 3 })
    expect(failed.hint.kind).toBe('silence')
    expect(sayReducer(failed, { type: 'begin', data }).hint).toBe(null)
    expect(fail(run(), done('I am trying to please both')).hint).toBe(null)
    const busy = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'audio-capture' })
    expect(busy).toMatchObject({ phase: 'failed', hint: null })
    expect(busy.event.extra.hintKind).toBeUndefined()
    const denied = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed' })
    expect(denied).toMatchObject({ phase: 'fallback', hint: null })
  })

  it('hintsOn=false: подсказки нет вовсе (и hint_kind в событии не пишется); поле hintsOn отсутствует = включено; свой текст из ноды', () => {
    const off = readSayData({ phrase: 'I am trying to please both', hintsOn: false })
    const s = fail(begin(off), done('banana'))
    expect(s).toMatchObject({ phase: 'failed', hint: null })
    expect(s.event.extra.hintKind).toBeUndefined()
    const custom = readSayData({ phrase: 'I am trying to please both', hintPartial: 'Ещё чуть-чуть: {missed}' })
    expect(fail(begin(custom), done('I am trying')).hint.text).toBe('Ещё чуть-чуть: to, please, both')
  })
})
