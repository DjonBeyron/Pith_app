import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState, planTap, isGo } from './sayFlow.js'
import { micLabel, attemptText, isSquareMode } from './sayMic.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

// Последовательность состояний кнопки «Сказать фразу»: idle → morphing (prep) → listening → success (галочка) | fail (крестик → таймаут → idle)
// и счётчик попыток «Попытка N». Чисто: reducer + micLabel, без React.
const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, runNo = 1) => ({ ...emptyView, status: 'done', runNo, attempt: 1, final: alt(text), alternatives: [alt(text)] })
const listening = { ...emptyView, status: 'listening', runNo: 1, attempt: 1 }
const mode = s => micLabel({ phase: s.phase, verdict: s.verdict, fallbackReason: s.fallbackReason, go: isGo(s), failShow: s.failShow }).mode
const att = s => attemptText({ taps: s.taps, failStreak: s.failStreak, phase: s.phase })
const begin = s => sayReducer(s, { type: 'begin', data })

describe('последовательность состояний кнопки', () => {
  it('idle → morphing (prep) → listening: «Слушаю» только когда И морфинг завершён, И движок слушает (любой порядок)', () => {
    let s = initialSayState({ action: 'listen' })
    expect(mode(s)).toBe('idle')
    s = begin(s)
    expect(mode(s)).toBe('prep')
    // audiostart раньше конца морфинга — всё ещё prep
    const a = sayReducer(s, { type: 'view', view: listening })
    expect(mode(a)).toBe('prep')
    expect(mode(sayReducer(a, { type: 'morphEnd' }))).toBe('listening')
    // морфинг кончился раньше audiostart — prep до audiostart
    const b = sayReducer(s, { type: 'morphEnd' })
    expect(mode(b)).toBe('prep')
    expect(mode(sayReducer(b, { type: 'view', view: listening }))).toBe('listening')
    expect(['prep', 'listening', 'ok', 'fail'].every(isSquareMode)).toBe(true)
    expect(['idle', 'off'].some(isSquareMode)).toBe(false)
  })

  it('успех: квадрат остаётся (ok), без возврата в прямоугольник; счётчика нет', () => {
    let s = sayReducer(sayReducer(begin(initialSayState({ action: 'listen' })), { type: 'morphEnd' }), { type: 'view', view: listening })
    s = sayReducer(s, { type: 'view', view: done('I am trying to please both') })
    expect(s.phase).toBe('passed')
    expect(mode(s)).toBe('ok')
    expect(s.failShow).toBe(false)
    expect(att(s)).toBe(null)
    expect(isSquareMode(mode(s))).toBe(true)
  })

  it('неудача: fail (крестик, квадрат) → по таймеру failEnd → idle (прямоугольник «Нажмите, чтобы говорить») → можно снова; тапы в fail игнорируются', () => {
    let s = sayReducer(sayReducer(begin(initialSayState({ action: 'listen' })), { type: 'morphEnd' }), { type: 'view', view: listening })
    s = sayReducer(s, { type: 'view', view: done('I am trying') })
    expect(s.phase).toBe('failed')
    expect(s.failShow).toBe(true)
    expect(mode(s)).toBe('fail')
    expect(planTap({ view: s.view, decision: { action: 'listen' }, go: isGo(s), hold: s.failShow }).act).toBe('ignore')
    s = sayReducer(s, { type: 'failEnd' })
    expect(mode(s)).toBe('idle')
    expect(sayReducer(s, { type: 'failEnd' })).toBe(s) // повтор безвреден
    expect(planTap({ view: s.view, decision: { action: 'listen' }, hold: s.failShow }).act).toBe('begin')
    // новая попытка во время показа крестика (страховка) тоже сбрасывает fail
    const f = sayReducer(sayReducer(begin(initialSayState({ action: 'listen' })), { type: 'view', view: done('I am trying') }), { type: 'noop' })
    expect(f.failShow).toBe(true)
    expect(begin(f).failShow).toBe(false)
  })

  it('отказ микрофона (not-allowed) и сворачивание не показывают крестик', () => {
    const base = begin(initialSayState({ action: 'listen' }))
    const den = sayReducer(base, { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 } })
    expect(den.failShow).toBe(false)
    expect(mode(den)).toBe('off')
    const cut = sayReducer(base, { type: 'interrupt' })
    expect(mode(cut)).toBe('idle')
  })
})

describe('счётчик «Попытка N»', () => {
  it('N = число начатых записей; появляется после первой неудачи, остаётся при следующих, при успехе скрыт', () => {
    let s = initialSayState({ action: 'listen' })
    expect(att(s)).toBe(null)
    s = begin(s)
    expect(att(s)).toBe(null) // первая попытка идёт — счётчика ещё нет
    s = sayReducer(s, { type: 'view', view: done('I am trying') }) // неудача №1
    expect(att(s)).toBe('Попытка 1')
    s = sayReducer(s, { type: 'failEnd' })
    expect(att(s)).toBe('Попытка 1')
    s = begin(s)
    expect(att(s)).toBe('Попытка 2') // идёт вторая запись — счётчик остаётся
    s = sayReducer(s, { type: 'view', view: done('I am trying', 2) })
    expect(att(s)).toBe('Попытка 2')
    s = begin(sayReducer(s, { type: 'failEnd' }))
    s = sayReducer(s, { type: 'view', view: done('I am trying to please both', 3) })
    expect(s.phase).toBe('passed')
    expect(att(s)).toBe(null)
  })

  it('формат: «Попытка 12»; без неудач и без записей — null', () => {
    expect(attemptText({ taps: 12, failStreak: 3, phase: 'failed' })).toBe('Попытка 12')
    expect(attemptText({ taps: 0, failStreak: 1, phase: 'idle' })).toBe(null)
    expect(attemptText({ taps: 3, failStreak: 0, phase: 'run' })).toBe(null)
  })
})

describe('попап: вид в состоянии и пометка реального уровня', () => {
  it('explain запоминает kind (full | short); по умолчанию full; отмена возвращает idle без флагов', () => {
    const s0 = initialSayState({ action: 'listen' })
    expect(sayReducer(s0, { type: 'explain', kind: 'short' })).toMatchObject({ phase: 'explain', explainKind: 'short', explainer: true })
    expect(sayReducer(s0, { type: 'explain' }).explainKind).toBe('full')
    expect(sayReducer(sayReducer(s0, { type: 'explain', kind: 'short' }), { type: 'explainCancel' }).phase).toBe('idle')
    expect(planTap({ view: emptyView, decision: { action: 'explain', kind: 'short' } })).toEqual({ act: 'explain', kind: 'short' })
  })

  it('realLevel: begin кладёт пометку в состояние и в строку админа; realStatus обновляет (ошибка → откат на синтетический)', () => {
    let s = sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data, realLevel: 'вкл' })
    expect(s.realLevel).toBe('вкл')
    s = sayReducer(s, { type: 'view', view: { ...listening, interim: 'I am' } })
    expect(s.adminLine.note).toMatch(/реальный уровень: вкл/)
    s = sayReducer(s, { type: 'realStatus', status: 'ошибка NotAllowedError → синтетический' })
    expect(s.realLevel).toMatch(/ошибка NotAllowedError/)
    expect(sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data }).realLevel).toBe(null)
  })
})
