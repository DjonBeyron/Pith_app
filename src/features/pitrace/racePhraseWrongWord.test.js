import { describe, it, expect, vi, afterEach } from 'vitest'
import { createWrongWord, fitsWord, sameWord, WRONG_GAP_MS } from './racePhraseWrongWord.js'
import { createNudge, NUDGE_MS } from './racePhraseNudge.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubDraft, stubSay, stubLevel } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Неверное слово в проходе 1 «Скажи» (решение владельца 2026-11-09): завершённое слово, не ожидаемое, не сказанное, не префикс/часть ожидаемого — рывок кромки красным (не чаще 700 мс),
// заливка не меняется; журнал «[fill] неверное слово «…», ждём «…»».
const W = ['I', 'want', 'to']
const said = (...ix) => new Map(ix.map(i => [i, true]))

describe('правило неверного слова (чистое)', () => {
  it('сравнение форм: само слово, сокращения, префикс, часть сокращения', () => {
    expect(sameWord('want', 'want')).toBe(true); expect(sameWord('am', "I'm")).toBe(true); expect(sameWord('im', "I'm")).toBe(true); expect(sameWord('cat', 'want')).toBe(false)
    expect(fitsWord('wan', 'want')).toBe(true); expect(fitsWord('i', "I'm")).toBe(true); expect(fitsWord('Want', 'want')).toBe(true); expect(fitsWord('to', 'want')).toBe(false); expect(fitsWord('', 'want')).toBe(false)
  })
  it('верное — нет; неверное завершённое — да (с ожидаемым словом); незавершённое в черновике — ещё нет; префикс и уже сказанное — нет; шум — нет', () => {
    const w = createWrongWord({ words: W })
    w.ear({ kind: 'partial', text: 'cat' }); expect(w.check(said(), 0)).toBe(null) // одно слово в черновике — может дописаться
    w.ear({ kind: 'partial', text: 'cat i' }); expect(w.check(said(), 10)).toEqual({ word: 'cat', expect: 'I' }) // за ним следующее — завершено; неверное первое слово
    w.ear({ kind: 'final', text: 'cat i' }); expect(w.check(said(0), 20)).toBe(null) // «i» сказано — подходит
    const v = createWrongWord({ words: W })
    v.ear({ kind: 'final', text: 'i' }); expect(v.check(said(0), 0)).toBe(null)
    v.ear({ kind: 'final', text: 'i i' }); expect(v.check(said(0), 100)).toBe(null) // повтор уже сказанного
    v.ear({ kind: 'final', text: 'wan' }); expect(v.check(said(0), 200)).toBe(null) // префикс ожидаемого
    v.ear({ kind: 'final', text: '' }); v.ear({ kind: 'partial', text: '[unk]' }); v.ear({ kind: 'gate', open: true }); expect(v.check(said(0), 300)).toBe(null) // шум
    v.ear({ kind: 'final', text: 'cat' }); expect(v.check(said(0), 400)).toEqual({ word: 'cat', expect: 'want' })
    v.ear({ kind: 'final', text: 'to' }); expect(v.check(said(0, 1, 2), 2000)).toBe(null) // всё сказано — не проверяем
  })
  it('каждое завершённое слово — один раз: черновик растёт, итог повторяет заход; новый заход — счёт заново', () => {
    const w = createWrongWord({ words: W })
    w.ear({ kind: 'partial', text: 'i cat' }); w.ear({ kind: 'partial', text: 'i cat want' }); expect(w.check(said(0), 0)).toEqual({ word: 'cat', expect: 'want' })
    w.ear({ kind: 'final', text: 'i cat want' }); expect(w.check(said(0, 1), 5000)).toBe(null) // «cat» уже разобран, «want» сказано
    w.ear({ kind: 'partial', text: 'dog to' }); expect(w.check(said(0, 1), 6000)).toEqual({ word: 'dog', expect: 'to' })
  })
  it('частота: не чаще WRONG_GAP_MS — неверное слово в паузе пропускается', () => {
    const w = createWrongWord({ words: W })
    w.ear({ kind: 'final', text: 'cat' }); expect(w.check(said(), 1000)).not.toBe(null)
    w.ear({ kind: 'final', text: 'dog' }); expect(w.check(said(), 1000 + WRONG_GAP_MS - 1)).toBe(null)
    w.check(said(), 1000 + WRONG_GAP_MS); expect(w.check(said(), 1000 + WRONG_GAP_MS)).toBe(null) // пропущенное не копится
    w.ear({ kind: 'final', text: 'dog' }); expect(w.check(said(), 1000 + WRONG_GAP_MS)).toEqual({ word: 'dog', expect: 'I' })
  })
})

describe('рывок кромки (data-nudge)', () => {
  it('fire ставит атрибут, снимает по animationend wlNudge или по таймеру; stop снимает и отписывается', () => {
    const marks = [], timers = [], handlers = {}
    const el = { addEventListener: (n, f) => { handlers[n] = f }, removeEventListener: n => { delete handlers[n] } }
    const n = createNudge({ mark: on => marks.push(on), el, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length }, clearTimer: () => {} })
    n.fire(); expect(marks).toEqual([true]); expect(n.on()).toBe(true); expect(timers[0].ms).toBe(NUDGE_MS + 80)
    handlers.animationend({ animationName: 'other' }); expect(n.on()).toBe(true)
    handlers.animationend({ animationName: 'wlNudge' }); expect(marks).toEqual([true, false]); expect(n.on()).toBe(false)
    n.fire(); timers.at(-1).f(); expect(marks).toEqual([true, false, true, false])
    n.fire(); n.stop(); expect(marks.at(-1)).toBe(false); expect(handlers.animationend).toBeUndefined()
  })
})

describe('неверное слово в сцене', () => {
  afterEach(() => vi.useRealTimers())
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  it('проход 1: после «nice» неверное «hello» — рывок (data-nudge), журнал, заливка и подсказка не меняются; верное слово дальше — как обычно', () => {
    vi.useFakeTimers()
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    s.go(600); stubDraft('nice'); s.go(600)
    const p = s.pool.taken[0], before = p.fill
    expect(before).toBeGreaterThan(0); expect(p.attrs.has('data-nudge')).toBe(false)
    stubLevel(0.1); stubSay('hello'); s.go(16)
    expect(p.attrs.has('data-nudge')).toBe(true)
    expect(log.mock.calls.map(c => c[0])).toContain('[fill] неверное слово «hello», ждём «to»')
    s.go(400); expect(p.fill).toBe(before); expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'peek', 'hidden', 'hidden'])
    vi.advanceTimersByTime(NUDGE_MS + 100); expect(p.attrs.has('data-nudge')).toBe(false)
    stubSay('hello'); s.go(16); expect(p.attrs.has('data-nudge')).toBe(false) // чаще 700 мс — без рывка
    stubDraft('nice to'); s.go(16); expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'full', 'peek', 'hidden'])
    s.run.stop()
  })
  it('неверное первое слово — рывок от начала (заливка 0); шум без слов — нет', () => {
    vi.useFakeTimers()
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600); for (let i = 0; i < 20; i++) { stubLevel(0.1); s.go(16) }
    const p = s.pool.taken[0]; expect(p.attrs.has('data-nudge')).toBe(false)
    stubSay('hello'); s.go(16); expect(p.attrs.has('data-nudge')).toBe(true); expect(p.fill).toBe(0)
    s.run.stop(); expect(p.attrs.has('data-nudge')).toBe(false)
  })
  it('проход 2 — рывка нет', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600); stubSay('nice to meet you'); s.go(800)
    for (let i = 0; i < 2000 && s.pool.taken.length < 2; i++) s.go(16)
    const p = s.pool.taken[1]; s.go(300); expect(s.run.api.state().pass).toBe(2)
    stubSay('hello'); s.go(16); expect(p.attrs.has('data-nudge')).toBe(false)
    s.run.stop()
  })
})
