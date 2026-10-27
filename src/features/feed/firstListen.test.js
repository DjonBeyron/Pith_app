import { describe, it, expect } from 'vitest'
import { createFirstListen, FIRST_LISTEN_KEY, EVER_SOUND_KEY, FIRST_LISTEN_MS } from './firstListen.js'

// Хранилище в памяти и управляемые часы вместо localStorage и setTimeout
function setup(initial = {}) {
  const data = { ...initial }
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
  const clock = { now: 0, timers: [] }
  const fl = createFirstListen({
    storage,
    setTimer: (fn, ms) => { const t = { fn, at: clock.now + ms }; clock.timers.push(t); return t },
    clearTimer: t => { clock.timers = clock.timers.filter(x => x !== t) },
  })
  const advance = ms => {
    clock.now += ms
    for (const t of clock.timers.filter(x => x.at <= clock.now)) { clock.timers = clock.timers.filter(x => x !== t); t.fn() }
  }
  return { fl, data, advance }
}

describe('первое прослушивание со звуком', () => {
  it('сначала нет; звук включён и видео играло 3 с — есть, флаг на устройстве', () => {
    const { fl, data, advance } = setup()
    expect(fl.get()).toBe(false)
    fl.onEvent('feed_sound', { on: true })
    advance(FIRST_LISTEN_MS - 1)
    expect(fl.get()).toBe(false)
    advance(1)
    expect(fl.get()).toBe(true)
    expect(data[FIRST_LISTEN_KEY]).toBe('1')
  })
  it('выключили звук раньше 3 с — не засчитано', () => {
    const { fl, advance } = setup()
    fl.onEvent('feed_sound', { on: true })
    advance(2000)
    fl.onEvent('feed_sound', { on: false })
    advance(5000)
    expect(fl.get()).toBe(false)
  })
  it('пауза сбрасывает отсчёт, снятие паузы начинает заново', () => {
    const { fl, advance } = setup()
    fl.onEvent('feed_sound', { on: true })
    advance(2000)
    fl.onEvent('feed_pause', { on: true })
    advance(5000)
    expect(fl.get()).toBe(false)
    fl.onEvent('feed_pause', { on: false })
    advance(FIRST_LISTEN_MS)
    expect(fl.get()).toBe(true)
  })
  it('без включения звука не засчитывается вовсе', () => {
    const { fl, advance } = setup()
    fl.onEvent('feed_swipe', { dir: 'next' })
    advance(60000)
    expect(fl.get()).toBe(false)
  })
  it('флаг пережил перезапуск; звук включал до этой версии — тоже «слушал»', () => {
    expect(setup({ [FIRST_LISTEN_KEY]: '1' }).fl.get()).toBe(true)
    expect(setup({ [EVER_SOUND_KEY]: '1' }).fl.get()).toBe(true)
  })
  it('подписчики узнают о проявлении один раз', () => {
    const { fl, advance } = setup()
    let n = 0
    fl.subscribe(() => { n += 1 })
    fl.onEvent('feed_sound', { on: true })
    advance(FIRST_LISTEN_MS)
    fl.onEvent('feed_sound', { on: true })
    advance(FIRST_LISTEN_MS)
    expect(n).toBe(1)
  })
  it('хранилища нет — работает в памяти', () => {
    const fl = createFirstListen({ storage: null })
    expect(fl.get()).toBe(false)
    fl.dispose()
  })
})
