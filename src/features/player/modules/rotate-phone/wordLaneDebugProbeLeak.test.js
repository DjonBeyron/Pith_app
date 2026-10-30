import { describe, it, expect, vi, afterEach } from 'vitest'
import { createProbe, TICK_MS, TICK_ELS, PROBE_KEEP } from './wordLaneDebugProbe.js'
import { setGameAudioSink, gameAudioNote } from '../../../../shared/lib/gameAudioSink.js'

// Утечка отладки после игры (Читка в «Шлифовке», forceDebug): пробник держал в `playing` каждый <audio>, у которого 'pause' пришёл РАНЬШЕ 'playing' (разбудка слота: play() и сразу pause()).
// Таймер audio-tick после этого тикал вечно, каждая игра добавляла десятки элементов, а запись тика росла вместе с ними. Проверяем: такой элемент не отслеживается, зависший вычищается, release() гасит всё.
afterEach(() => { vi.useRealTimers(); setGameAudioSink(null) })

function env() {
  class Media {
    constructor(over = {}) { this.l = {}; Object.assign(this, { tagName: 'AUDIO', src: 'https://x.test/a.mp3', readyState: 4, muted: false, volume: 1, paused: true, ended: false, currentTime: 0 }, over) }
    addEventListener(t, f) { (this.l[t] ??= []).push(f) }
    fire(t) { (this.l[t] ?? []).forEach(f => f()) }
    play() { return Promise.resolve() }
  }
  const doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  const win = { HTMLMediaElement: Media, addEventListener() {}, removeEventListener() {} }
  const nav = { audioSession: { type: 'play-and-record' }, userActivation: { isActive: true, hasBeenActive: true } }
  let t = 1000
  return { Media, doc, win, nav, now: () => (t += 1) }
}
const ticks = probe => probe.snapshot().filter(x => x.kind === 'audio-tick')

describe('пробник: зависшие «звучащие» элементы', () => {
  it('pause пришёл раньше playing (разбудка слота тишиной): элемент не отслеживается, таймера тиков нет', () => {
    vi.useFakeTimers()
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const el = new e.Media()
    el.play()
    el.fire('pause')            // pause() сразу после play() промиса — событие pause первым
    el.fire('playing')          // запоздавшее playing: элемент уже на паузе
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(TICK_MS * 4)
    expect(ticks(probe)).toHaveLength(0)
    probe.uninstall()
  })

  it('элемент остановили, а pause / ended так и не пришли: следующий тик его вычищает и таймер останавливается', () => {
    vi.useFakeTimers()
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const el = new e.Media()
    el.play(); el.paused = false; el.fire('playing')
    vi.advanceTimersByTime(TICK_MS + 10)
    expect(ticks(probe)).toHaveLength(1)
    el.paused = true            // потеряли событие pause (src снят, элемент выброшен)
    vi.advanceTimersByTime(TICK_MS * 6)
    expect(ticks(probe)).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    probe.uninstall()
  })

  it('release() (конец игры): список звучащих сброшен, таймер остановлен, даже если элементы ещё «играют»', () => {
    vi.useFakeTimers()
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    for (let i = 0; i < 5; i++) { const el = new e.Media(); el.play(); el.paused = false; el.fire('playing') }
    expect(vi.getTimerCount()).toBe(1)
    probe.release()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(TICK_MS * 4)
    expect(ticks(probe)).toHaveLength(0)
    probe.uninstall()
  })

  it('тик описывает не больше TICK_ELS элементов, остальное — числом n: запись не растёт со слотами', () => {
    vi.useFakeTimers()
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    for (let i = 0; i < TICK_ELS + 12; i++) { const el = new e.Media(); el.play(); el.paused = false; el.fire('playing') }
    vi.advanceTimersByTime(TICK_MS + 10)
    const t = ticks(probe)[0]
    expect(t.els).toHaveLength(TICK_ELS)
    expect(t.n).toBe(TICK_ELS + 12)
    probe.release(); probe.uninstall()
  })
})

describe('пробник и журнал: ограничения', () => {
  it('события пробника не копятся без предела: не больше PROBE_KEEP', () => {
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    for (let i = 0; i < PROBE_KEEP + 700; i++) gameAudioNote('mic-hold', { on: !!(i % 2) })
    expect(probe.snapshot().length).toBeLessThanOrEqual(PROBE_KEEP)
    expect(probe.snapshot().at(-1)).toMatchObject({ kind: 'mic-hold' })
    probe.uninstall()
  })
})
