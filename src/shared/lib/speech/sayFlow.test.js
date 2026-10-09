import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, extra = {}) => ({ ...emptyView, status: 'done', runNo: 1, attempt: 1, final: alt(text), alternatives: [alt(text)], ...extra })
const run = () => sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data })

describe('sayReducer', () => {
  it('начало: фаза run, попытка №1, данные фиксируются на тап', () => {
    const s = run()
    expect(s).toMatchObject({ phase: 'run', taps: 1, data })
  })

  it('верно сказали → passed с вердиктом и событием result', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to please both') })
    expect(s.phase).toBe('passed')
    expect(s.verdict.ratioPct).toBe(100)
    expect(s.event).toMatchObject({ name: 'say_phrase_result', extra: { passed: true, ratioPct: 100 } })
    expect(s.settledRun).toBe(1)
  })

  it('порог 70% и ключевое слово: без «please» не засчитано, даже если слов достаточно', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to both') })
    expect(s.phase).toBe('failed')
    expect(s.verdict.passed).toBe(false)
  })

  it('автоповторы связи записываются: passed после network ×2 → autoRetries=2', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to please both', { attempt: 3 }) })
    expect(s).toMatchObject({ phase: 'passed', autoRetries: 2 })
    expect(s.event.extra.autoRetries).toBe(2)
  })

  it('ошибка network после автоповторов → failed с кодом; not-allowed → fallback denied', () => {
    const net = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'network', attempt: 3 } })
    expect(net).toMatchObject({ phase: 'failed', errorCode: 'network' })
    const den = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 } })
    expect(den).toMatchObject({ phase: 'fallback', fallbackReason: 'denied' })
    expect(den.event.extra).toMatchObject({ passed: false, reason: 'denied' })
  })

  it('конец без текста (остановили до речи) → «не слышу речь»', () => {
    const s = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'done', runNo: 1, final: null } })
    expect(s).toMatchObject({ phase: 'failed', errorCode: 'no-speech' })
  })

  it('итог обрабатывается один раз на заход; события вне записи игнорируются', () => {
    const s1 = sayReducer(run(), { type: 'view', view: done('I am trying to please both') })
    const s2 = sayReducer(s1, { type: 'view', view: done('whatever') })
    expect(s2.phase).toBe('passed')
    const idle = initialSayState({ action: 'listen' })
    expect(sayReducer(idle, { type: 'view', view: done('I am trying to please both') }).phase).toBe('idle')
  })

  it('сворачивание: попытка не тратится, панель снова готова', () => {
    const s = sayReducer(run(), { type: 'interrupt' })
    expect(s).toMatchObject({ phase: 'idle', taps: 0 })
  })

  it('пояснение → explain; fallback onlyIdle не перебивает идущую запись; enable возвращает к микрофону', () => {
    const e = sayReducer(initialSayState({ action: 'explain' }), { type: 'explain' })
    expect(e).toMatchObject({ phase: 'explain', explainer: true })
    expect(sayReducer(run(), { type: 'fallback', reason: 'denied', onlyIdle: true }).phase).toBe('run')
    const f = initialSayState({ action: 'fallback', reason: 'cant_speak' })
    expect(f).toMatchObject({ phase: 'fallback', fallbackReason: 'cant_speak' })
    expect(sayReducer(f, { type: 'enable' })).toMatchObject({ phase: 'idle', fallbackReason: null })
  })
})
