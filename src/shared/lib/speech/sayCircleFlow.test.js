import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState, planTap, isGo } from './sayFlow.js'
import { micLabel, isLiveMode, isCalmMode, LIVE_MODES } from './sayMic.js'
import { MIC_IDLE, SAY_LABEL, MIC_RETRY, DONE, MIC_OFF, MIC_UNAVAILABLE } from './sayTexts.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

// Последовательность состояний круга-микрофона «Сказать фразу» и надписи над ним:
// idle («Нажмите, чтобы говорить») → тап → prep/listening («Произнесите фразу») → неудача → retry («Попробуйте сказать ещё раз») → снова тап | успех → ok («Готово»).
// Чисто: reducer + micLabel, без React.
const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, runNo = 1) => ({ ...emptyView, status: 'done', runNo, attempt: 1, final: alt(text), alternatives: [alt(text)] })
const listening = { ...emptyView, status: 'listening', runNo: 1, attempt: 1 }
const look = s => micLabel({ phase: s.phase, fallbackReason: s.fallbackReason, go: isGo(s), exhausted: s.exhausted })
const begin = s => sayReducer(s, { type: 'begin', data })
const idle = () => initialSayState({ action: 'listen' })

describe('надпись над кругом и режим круга по состояниям', () => {
  it('idle → тап → «Произнесите фразу» (сразу, ещё до audiostart) → слушаем; круг не меняет форму: режимов с квадратом нет', () => {
    let s = idle()
    expect(look(s)).toEqual({ label: MIC_IDLE, mode: 'idle' })
    expect(MIC_IDLE).toBe('Нажмите, чтобы говорить')
    s = begin(s)
    expect(look(s)).toEqual({ label: SAY_LABEL, mode: 'prep' }) // надпись сменилась в тот же тап, эквалайзер уже живой
    expect(SAY_LABEL).toBe('Произнесите фразу')
    s = sayReducer(s, { type: 'view', view: listening })
    expect(look(s).mode).toBe('prep')                           // audiostart есть, но защита от двойного тапа ещё идёт
    s = sayReducer(s, { type: 'arm' })
    expect(look(s)).toEqual({ label: SAY_LABEL, mode: 'listening' })
    expect(LIVE_MODES).toEqual(['prep', 'listening'])
    expect(['prep', 'listening'].every(isLiveMode)).toBe(true)
    expect(['idle', 'retry', 'ok', 'off'].some(isLiveMode)).toBe(false)
  })

  it('неудача → СРАЗУ «Попробуйте сказать ещё раз» (без крестика, красного слоя и паузы показа) → тап снова начинает попытку', () => {
    let s = sayReducer(sayReducer(begin(idle()), { type: 'arm' }), { type: 'view', view: listening })
    s = sayReducer(s, { type: 'view', view: done('I am trying') })
    expect(s.phase).toBe('failed')
    expect(look(s)).toEqual({ label: MIC_RETRY, mode: 'retry' })
    expect(MIC_RETRY).toBe('Попробуйте сказать ещё раз')
    expect(s).not.toHaveProperty('failShow')
    expect(planTap({ view: s.view, decision: { action: 'listen' }, go: isGo(s), running: s.phase === 'run' }).act).toBe('begin')
    s = begin(s)
    expect(look(s).label).toBe(SAY_LABEL) // надпись снова «Произнесите фразу»
  })

  it('первые две неудачи: каждый раз «Попробуйте сказать ещё раз», микрофон снова доступен; третья — надписи нет (панель уходит по ветке «неверный»)', () => {
    let s = idle()
    for (let i = 1; i <= 2; i++) {
      s = begin(s)
      s = sayReducer(s, { type: 'view', view: done('banana', i) })
      expect(look(s)).toEqual({ label: MIC_RETRY, mode: 'retry' })
      expect(s.reply).toEqual({ text: 'Banana', n: i }) // каждая попытка уходит в чат
    }
    s = sayReducer(begin(s), { type: 'view', view: done('banana', 3) })
    expect(s.exhausted).toBe(true)
    expect(look(s)).toEqual({ label: '', mode: 'retry' })
    expect(s.reply).toEqual({ text: 'Banana', n: 3 }) // реплика последней попытки тоже уходит в чат
    expect(begin(s)).toBe(s)                          // новая запись после третьей неудачи не начинается
    expect(s.taps).toBe(3)
  })

  it('успех: в круге «Готово» и галочка (режим ok), надписи над кругом нет; одна надпись для 100% и неполного совпадения', () => {
    let s = sayReducer(sayReducer(begin(idle()), { type: 'arm' }), { type: 'view', view: listening })
    s = sayReducer(s, { type: 'view', view: done('I am trying to please both') })
    expect(s.phase).toBe('passed')
    expect(look(s)).toEqual({ label: '', mode: 'ok' })
    expect(DONE).toBe('Готово')
    expect(isCalmMode('ok')).toBe(true)
    const soft = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 50 })
    const s2 = sayReducer(sayReducer(idle(), { type: 'begin', data: soft }), { type: 'view', view: done('I am trying to please') })
    expect(s2.phase).toBe('passed')
    expect(look(s2).mode).toBe('ok')
  })

  it('отказ микрофона и «Микрофон не поддерживается» — режим off с системной надписью; сворачивание возвращает idle', () => {
    const base = begin(idle())
    const den = sayReducer(base, { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 } })
    expect(look(den)).toEqual({ label: MIC_OFF, mode: 'off' })
    expect(micLabel({ phase: 'fallback', fallbackReason: 'unsupported' })).toEqual({ label: MIC_UNAVAILABLE, mode: 'off' })
    expect(isCalmMode('off')).toBe(true)
    expect(look(sayReducer(base, { type: 'interrupt' }))).toEqual({ label: MIC_IDLE, mode: 'idle' })
  })

  it('счётчика попыток нет: ни в состоянии, ни в sayMic/sayTexts', async () => {
    const mic = await import('./sayMic.js')
    const texts = await import('./sayTexts.js')
    expect(mic).not.toHaveProperty('attemptText')
    expect(texts).not.toHaveProperty('ATTEMPT')
    expect(JSON.stringify(Object.values(texts))).not.toMatch(/Попытка/)
  })
})

describe('попап: вид в состоянии и пометка реального уровня', () => {
  it('explain запоминает kind (full | short); по умолчанию full; отмена возвращает idle без флагов', () => {
    const s0 = idle()
    expect(sayReducer(s0, { type: 'explain', kind: 'short' })).toMatchObject({ phase: 'explain', explainKind: 'short', explainer: true })
    expect(sayReducer(s0, { type: 'explain' }).explainKind).toBe('full')
    expect(sayReducer(sayReducer(s0, { type: 'explain', kind: 'short' }), { type: 'explainCancel' }).phase).toBe('idle')
    expect(planTap({ view: emptyView, decision: { action: 'explain', kind: 'short' } })).toEqual({ act: 'explain', kind: 'short' })
  })

  it('realLevel: begin кладёт пометку в состояние и в строку админа; realStatus обновляет (ошибка → откат на синтетический)', () => {
    let s = sayReducer(idle(), { type: 'begin', data, realLevel: 'вкл' })
    expect(s.realLevel).toBe('вкл')
    s = sayReducer(s, { type: 'view', view: { ...listening, interim: 'I am' } })
    expect(s.adminLine.note).toMatch(/реальный уровень: вкл/)
    s = sayReducer(s, { type: 'realStatus', status: 'ошибка NotAllowedError → синтетический' })
    expect(s.realLevel).toMatch(/ошибка NotAllowedError/)
    expect(sayReducer(idle(), { type: 'begin', data }).realLevel).toBe(null)
  })
})
