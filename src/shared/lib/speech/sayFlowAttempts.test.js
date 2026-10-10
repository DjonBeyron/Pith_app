import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState, nextCounts, MAX_FAILED_ATTEMPTS, MAX_SILENCES } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

// Счёт попыток «Сказать фразу» (sayFlow.js): внутренний, ученику не показывается. Распознано что-то (в том числе неверное) — попытка потрачена;
// тишина — нет, но три тишины подряд = одна неудача; ошибки движка и микрофона не тратят. Третья засчитанная неудача → exhausted.
const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, extra = {}) => ({ ...emptyView, status: 'done', runNo: 1, attempt: 1, final: alt(text), alternatives: [alt(text)], ...extra })

describe('счёт попыток: три засчитанные неудачи → exhausted (ветка «неверный»)', () => {
  const view = (extra = {}) => ({ ...emptyView, runNo: 1, attempt: 1, ...extra })
  const step = (s, v, runNo) => sayReducer(sayReducer(s, { type: 'begin', data }), { type: 'view', view: { ...v, runNo } })
  const wrong = (s, n) => step(s, done('banana apple'), n)
  const silence = (s, n) => step(s, view({ status: 'error', error: 'no-speech' }), n)
  const stopped = (s, n) => step(s, view({ status: 'done', final: null, alternatives: [] }), n) // остановили до речи
  const start = () => initialSayState({ action: 'listen' })

  it('распознано что-то (в том числе неверное) тратит попытку; на третьей exhausted, событие помечено', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(3)
    let s = wrong(start(), 1)
    expect(s).toMatchObject({ attempts: 1, exhausted: false })
    s = wrong(s, 2)
    expect(s).toMatchObject({ attempts: 2, exhausted: false })
    s = wrong(s, 3)
    expect(s).toMatchObject({ attempts: 3, exhausted: true, phase: 'failed', failStreak: 3 })
    expect(s.event.extra.exhausted).toBe(true)
    expect(s.reply).toMatchObject({ text: 'Banana apple' }) // реплика последней попытки в чат уходит, как на любой неудаче
  })

  it('«почти» (≥50% слов) — тоже засчитанная неудача', () => {
    expect(step(start(), done('I am trying'), 1)).toMatchObject({ attempts: 1, failStreak: 1 })
  })

  it('тишина попытку НЕ тратит; три тишины подряд — одна неудача', () => {
    let s = silence(start(), 1)
    expect(s).toMatchObject({ attempts: 0, silences: 1, exhausted: false, failStreak: 1 })
    s = stopped(s, 2) // остановили до речи — для счёта та же тишина
    expect(s).toMatchObject({ attempts: 0, silences: 2 })
    s = silence(s, 3)
    expect(MAX_SILENCES).toBe(3)
    expect(s).toMatchObject({ attempts: 1, silences: 0, exhausted: false })
    expect(s.event.extra.exhausted).toBe(false)
  })

  it('девять тишин подряд = три неудачи = exhausted; две тишины и речь — серия тишин обрывается', () => {
    let s = start()
    for (let i = 1; i <= 9; i++) s = silence(s, i)
    expect(s).toMatchObject({ attempts: 3, exhausted: true })
    let t = silence(silence(start(), 1), 2)
    t = wrong(t, 3)
    expect(t).toMatchObject({ attempts: 1, silences: 0 })
    t = silence(silence(t, 4), 5)
    expect(t).toMatchObject({ attempts: 1, silences: 2 }) // счёт тишин начался заново, а не продолжился
  })

  it('ошибки движка и разрешения микрофона попытку не тратят и обрывают серию тишин', () => {
    for (const error of ['network', 'audio-capture', 'service-not-allowed', 'aborted', 'start-failed', 'vosk-error']) {
      expect(step(start(), view({ status: 'error', error }), 1)).toMatchObject({ attempts: 0, silences: 0, phase: 'failed' })
    }
    const s = step(silence(silence(start(), 1), 2), view({ status: 'error', error: 'network' }), 3)
    expect(s).toMatchObject({ attempts: 0, silences: 0 })
    expect(step(start(), view({ status: 'error', error: 'not-allowed' }), 1)).toMatchObject({ phase: 'fallback', attempts: 0 }) // отказ микрофона — запасной режим, не попытка
  })

  it('успех сбрасывает серию тишин и не трогает счёт; нейтральные ответы без текста — тишина', () => {
    const s = step(silence(silence(start(), 1), 2), done('I am trying to please both'), 3)
    expect(s).toMatchObject({ phase: 'passed', silences: 0, exhausted: false })
    expect(step(start(), done(''), 1)).toMatchObject({ attempts: 0, silences: 1 })
  })

  it('после exhausted новая запись не начинается (begin игнорируется), взятое состояние не меняется', () => {
    let s = start()
    for (let i = 1; i <= 3; i++) s = wrong(s, i)
    expect(sayReducer(s, { type: 'begin', data })).toBe(s)
  })

  it('nextCounts — чистая функция счёта', () => {
    expect(nextCounts({ attempts: 0, silences: 0 }, { spoke: true, quiet: false })).toEqual({ attempts: 1, silences: 0 })
    expect(nextCounts({ attempts: 1, silences: 2 }, { spoke: false, quiet: true })).toEqual({ attempts: 2, silences: 0 })
    expect(nextCounts({ attempts: 1, silences: 1 }, { spoke: false, quiet: false })).toEqual({ attempts: 1, silences: 0 })
  })
})
