import { describe, it, expect, vi } from 'vitest'
import { createPromptSlot } from './promptSlotCore.js'
import { emptyState } from './promptBudget.js'
import { PROMPT_SHOWN, PROMPT_ANSWER, PROMPT_DISMISS } from '../analytics/eventNames.js'
import * as R from './promptRules.js'

// Очередь и события слота без React: время, хранилище, track и таймеры подменены
const T0 = 1_000_000
const q = (id, extra = {}) => ({ id, kind: 'question', reason: 'behavior', ...extra })

function make(init = emptyState()) {
  const env = { t: T0, saved: null, timers: [] }
  const track = vi.fn()
  const slot = createPromptSlot({
    load: () => init,
    save: s => { env.saved = s },
    track,
    now: () => env.t,
    setTimer: (fn, ms) => { const h = { fn, ms }; env.timers.push(h); return h },
    clearTimer: h => { env.timers = env.timers.filter(x => x !== h) },
  })
  return { slot, track, env }
}
const open = ({ slot, env }) => { slot.start(); env.t += R.MIN_MS_AFTER_OPEN + 1 }

describe('promptSlotCore', () => {
  it('до 20 с кандидат ждёт, таймер будит слот сам', () => {
    const m = make()
    m.slot.start()
    m.slot.request(q('a'))
    expect(m.slot.getCurrent()).toBeNull()
    expect(m.env.timers).toHaveLength(1)
    m.env.t += R.MIN_MS_AFTER_OPEN + 100
    m.env.timers[0].fn()
    expect(m.slot.getCurrent().id).toBe('a')
    expect(m.track).toHaveBeenCalledWith(PROMPT_SHOWN, { kind: 'question', id: 'a' })
  })
  it('start идемпотентен: сессия не удваивается', () => {
    const m = make()
    m.slot.start(); m.slot.start()
    expect(m.slot.getState().sessions).toBe(1)
  })
  it('пока показан один, второй ждёт; после ответа показывается следующий', () => {
    const m = make({ ...emptyState(), sessions: 9 })
    open(m)
    m.slot.request(q('a'))
    m.slot.request(q('b'))
    expect(m.slot.getCurrent().id).toBe('a')
    m.slot.answer('yes')
    // следующий ждёт 5 слайдов
    expect(m.slot.getCurrent()).toBeNull()
    for (let i = 0; i < 5; i++) m.slot.onSlide(i)
    expect(m.slot.getCurrent().id).toBe('b')
  })
  it('события answer / dismiss / later: плоские props, ms от показа', () => {
    const m = make({ ...emptyState(), sessions: 9 })
    open(m)
    m.slot.request(q('a'))
    m.env.t += 1500
    m.slot.answer('word_x')
    expect(m.track).toHaveBeenLastCalledWith(PROMPT_ANSWER, { kind: 'question', id: 'a', answer: 'word_x', ms: 1500 })
    m.slot.request(q('b')); for (let i = 0; i < 5; i++) m.slot.onSlide(i)
    m.env.t += 700
    m.slot.dismiss()
    expect(m.track).toHaveBeenLastCalledWith(PROMPT_DISMISS, { kind: 'question', id: 'b', later: false, ms: 700 })
    expect(m.slot.getCurrent()).toBeNull()
  })
  it('later ставит паузу, событие с later: true', () => {
    const m = make({ ...emptyState(), sessions: 9 })
    open(m)
    m.slot.request(q('a'))
    m.slot.later()
    expect(m.track).toHaveBeenLastCalledWith(PROMPT_DISMISS, expect.objectContaining({ later: true }))
    expect(m.slot.getState().laterUntil).toBe(m.env.t + R.LATER_PAUSE_MS)
    expect(m.env.saved.laterStreak).toBe(1)
  })
  it('busy блокирует, снятие busy показывает', () => {
    const m = make()
    open(m)
    m.slot.setBusy({ audio: true })
    m.slot.request(q('a'))
    expect(m.slot.getCurrent()).toBeNull()
    m.slot.setBusy({ audio: false })
    expect(m.slot.getCurrent().id).toBe('a')
  })
  it('приоритет: из ожидающих первым выходит более важный', () => {
    const m = make()
    open(m)
    m.slot.setBusy({ input: true })
    m.slot.request({ id: 'g', kind: 'offer', reason: 'game_offer' })
    m.slot.request({ id: 'e', kind: 'offer', reason: 'explain_done' })
    m.slot.setBusy({ input: false })
    expect(m.slot.getCurrent().id).toBe('e')
  })
  it('повторный request того же id игнорируется; просроченный кандидат из очереди выпадает', () => {
    const m = make()
    open(m)
    m.slot.setBusy({ audio: true })
    m.slot.request(q('a')); m.slot.request(q('a'))
    m.env.t += R.QUEUE_TTL_MS + 1
    m.slot.setBusy({ audio: false })
    expect(m.slot.getCurrent()).toBeNull()
    expect(m.track).not.toHaveBeenCalled()
  })
  it('подписчики уведомляются; кривой кандидат игнорируется', () => {
    const m = make()
    open(m)
    const fn = vi.fn()
    m.slot.subscribe(fn)
    m.slot.request({ kind: 'question' })
    expect(fn).not.toHaveBeenCalled()
    m.slot.request(q('a'))
    expect(fn).toHaveBeenCalled()
  })
  it('answer без показанной шторки — тишина', () => {
    const m = make()
    m.slot.answer('x'); m.slot.dismiss(); m.slot.later()
    expect(m.track).not.toHaveBeenCalled()
  })
})
