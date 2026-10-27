import { describe, it, expect } from 'vitest'
import { createPaceWatch, paceCandidate, PACE_AGAIN_SLIDES } from './paceQuestion.js'
import { signalFromEvent } from '../../../shared/lib/level/levelSignals.js'

const swipes = (watch, list) => list.map(ms => watch.onSwipe(ms))

describe('createPaceWatch', () => {
  it('три быстрых подряд → true на третьем', () => {
    expect(swipes(createPaceWatch(), [500, 900, 1200])).toEqual([false, false, true])
  })
  it('медленный свайп и свайп без времени обнуляют счёт', () => {
    const w = createPaceWatch()
    expect(swipes(w, [500, 900, 2000, 500, 900])).toEqual([false, false, false, false, false])
    expect(swipes(w, [300])).toEqual([true])
    const w2 = createPaceWatch()
    expect(swipes(w2, [500, 900, undefined, 500, 900, 700])).toEqual([false, false, false, false, false, true])
  })
  it('границы: ровно 2000 мс — не быстрый, 0 — быстрый', () => {
    expect(swipes(createPaceWatch(), [0, 1999, 2000])).toEqual([false, false, false])
    expect(swipes(createPaceWatch(), [0, 0, 0])).toEqual([false, false, true])
  })
  it('по умолчанию — раз за сессию: после срабатывания больше не спрашивает', () => {
    const w = createPaceWatch()
    expect(swipes(w, [1, 1, 1])).toEqual([false, false, true])
    expect(swipes(w, Array(PACE_AGAIN_SLIDES + 10).fill(1)).some(Boolean)).toBe(false)
  })
  it('пауза 20 слайдов между срабатываниями (если лимит сессии позволяет)', () => {
    const w = createPaceWatch({ maxPerSession: 2 })
    expect(swipes(w, [1, 1, 1])).toEqual([false, false, true])
    // 19 быстрых после срабатывания — всё ещё пауза
    expect(swipes(w, Array(PACE_AGAIN_SLIDES - 1).fill(1)).some(Boolean)).toBe(false)
    // после паузы три быстрых подряд срабатывают снова
    expect(swipes(w, [1, 1, 1, 1, 1, 1]).some(Boolean)).toBe(true)
    // третье срабатывание — уже сверх лимита сессии
    expect(swipes(w, Array(PACE_AGAIN_SLIDES + 10).fill(1)).some(Boolean)).toBe(false)
  })
  it('параметры fastMs и streak настраиваются', () => {
    expect(swipes(createPaceWatch({ fastMs: 5000, streak: 2 }), [4000, 4999])).toEqual([false, true])
  })
})

describe('paceCandidate', () => {
  it('вопрос по поведению про человека с тремя ответами и репликой на каждый', () => {
    const c = paceCandidate()
    expect(c).toMatchObject({ id: 'behavior:pace', kind: 'question', reason: 'behavior', aboutPerson: true })
    expect(c.text).toBe('Кажется, не зацепило. Подскажешь, что не так?')
    expect(c.answers.map(a => a.id)).toEqual(['too_fast', 'too_easy', 'fine'])
    expect(Object.keys(c.reply).sort()).toEqual(['fine', 'too_easy', 'too_fast'])
    expect(JSON.stringify(c)).not.toMatch(/(^|[^а-яё])я([^а-яё]|$)/i)
  })
  it('каждый ответ кандидата модель уровня видит как pit_answer', () => {
    const c = paceCandidate()
    for (const a of c.answers) {
      expect(signalFromEvent('prompt_answer', { kind: c.kind, id: c.id, answer: a.id }, {})).toEqual({ type: 'pit_answer', value: a.id })
    }
  })
})
