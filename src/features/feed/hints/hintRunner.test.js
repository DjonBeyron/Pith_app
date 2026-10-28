import { describe, it, expect } from 'vitest'
import { createHintJudge } from './behaviorHints.js'
import { createHintRunner } from './hintRunner.js'

// Шина событий и слот бюджета на коленке: слот запоминает request/cancel и по команде «показывает» кандидата,
// выпуская prompt_shown / prompt_answer так же, как настоящий (promptSlotCore.js)
function setup() {
  const listeners = new Set()
  const emit = (name, props) => listeners.forEach(fn => fn(name, props))
  const state = { now: 0, requests: [], cancels: [], sound: 0, timers: [], shownId: null }
  const slot = {
    request: c => { state.requests.push(c) },
    cancel: id => {
      state.cancels.push(id)
      if (state.shownId === id) { state.shownId = null; emit('prompt_answer', { id, answer: 'left' }) }
    },
  }
  const judge = createHintJudge({ store: { load: () => [], save: () => {} } })
  const runner = createHintRunner({
    judge, getSlot: () => slot, enableSound: () => { state.sound += 1 },
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    now: () => state.now,
    setTimer: (fn, ms) => { const t = { fn, at: state.now + ms }; state.timers.push(t); return t },
    clearTimer: t => { state.timers = state.timers.filter(x => x !== t) },
  })
  const stop = runner.start()
  const show = () => { const c = state.requests.at(-1); state.shownId = c.id; emit('prompt_shown', { id: c.id, kind: 'hint' }) }
  const advance = ms => {
    state.now += ms
    for (const t of state.timers.filter(x => x.at <= state.now)) { state.timers = state.timers.filter(x => x !== t); t.fn() }
  }
  return { runner, emit, state, show, advance, stop }
}

describe('hintRunner', () => {
  it('8 с без звука — кандидат hint:sound в бюджет (ui_hint, без legacy), с ответами и репликой', () => {
    const { runner, state, advance } = setup()
    runner.setSound(false)
    runner.onSlide(0)
    expect(state.requests).toHaveLength(0)
    advance(8100)
    expect(state.requests).toHaveLength(1)
    const c = state.requests[0]
    expect(c).toMatchObject({ id: 'hint:sound', kind: 'hint', reason: 'ui_hint' })
    expect(c.legacy).toBeUndefined()
    expect(c.answers.map(a => a.id)).toEqual(['listen', 'later'])
    expect(c.reply.later).toMatch(/без звука/)
  })
  it('ушли с ленты (idx < 0) — подсказка снимается из очереди/с экрана, чтобы не висеть на других вкладках', () => {
    const { runner, state, advance, show } = setup()
    runner.setSound(false)
    runner.onSlide(0)
    advance(8100)
    expect(state.requests.at(-1)).toMatchObject({ id: 'hint:sound', scope: 'feed' })
    show()
    runner.onSlide(-1)
    expect(state.cancels).toContain('hint:sound')
  })

  it('ответ «Послушаем?» включает звук; «Без звука» — нет', () => {
    const a = setup()
    a.runner.onSlide(0); a.advance(8100); a.show()
    a.emit('prompt_answer', { id: 'hint:sound', answer: 'listen' })
    expect(a.state.sound).toBe(1)
    const b = setup()
    b.runner.onSlide(0); b.advance(8100); b.show()
    b.emit('prompt_answer', { id: 'hint:sound', answer: 'later' })
    expect(b.state.sound).toBe(0)
  })
  it('после показа одной подсказки вторую за сессию не просит', () => {
    const { runner, emit, state, show, advance } = setup()
    runner.setSound(true)
    runner.onSlide(0)
    emit('feed_phrase_open', { module_id: 'a' })
    advance(7100)
    expect(state.requests.map(r => r.id)).toEqual(['hint:rub'])
    show()
    emit('prompt_answer', { id: 'hint:rub', answer: 'ok' })
    emit('feed_pause', { module_id: 'a', on: true })
    emit('feed_pause', { module_id: 'a', on: true })
    expect(state.requests).toHaveLength(1)
  })
  it('пока подсказка ждёт в очереди бюджета, вторую не просит', () => {
    const { runner, emit, state } = setup()
    runner.setSound(true)
    runner.onSlide(0)
    emit('feed_pause', { module_id: 'a', on: true })
    emit('feed_pause', { module_id: 'a', on: true })
    emit('feed_swipe', { dir: 'prev' })
    expect(state.requests).toHaveLength(1)
  })
  it('«потри» привязана к слайду: на другом слайде подсказка снимается', () => {
    const { runner, emit, state, show, advance } = setup()
    runner.setSound(true)
    runner.onSlide(0)
    emit('feed_phrase_open', { module_id: 'a' })
    advance(7100)
    show()
    runner.onSlide(1)
    expect(state.cancels).toEqual(['hint:rub'])
  })
  it('сами включили звук — «Послушаем?» из очереди убирается', () => {
    const { runner, state, advance } = setup()
    runner.onSlide(0)
    advance(8100)
    runner.setSound(true)
    expect(state.cancels).toEqual(['hint:sound'])
  })
  it('вне хоста бюджета (слота нет) — тишина', () => {
    const judge = createHintJudge({ store: { load: () => [], save: () => {} } })
    let t = 0
    const runner = createHintRunner({ judge, getSlot: () => null, enableSound() {}, subscribe: () => () => {}, now: () => t })
    runner.onSlide(0)
    t = 20000
    expect(() => runner.evaluate()).not.toThrow()
  })
  it('размонтирование снимает слушателя и свою подсказку', () => {
    const { runner, state, advance, stop, emit } = setup()
    runner.onSlide(0)
    advance(8100)
    stop()
    expect(state.cancels).toEqual(['hint:sound'])
    emit('feed_pause', { module_id: 'a', on: true })
    expect(state.requests).toHaveLength(1)
  })
})
