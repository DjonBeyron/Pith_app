import { describe, it, expect, vi } from 'vitest'
import { playLineAudio } from './audioLine.js'

// Поддельный <audio>: события через addEventListener, play() — промис; таймеры и rAF — руками
function fakeAudio({ rejectPlay = null } = {}) {
  const ls = {}
  return {
    src: '', currentTime: 0, paused: true, duration: NaN, readyState: 4, error: null, muted: false, playbackRate: 1,
    addEventListener(ev, fn) { (ls[ev] ??= new Set()).add(fn) },
    removeEventListener(ev, fn) { ls[ev]?.delete(fn) },
    fire(ev) { ls[ev]?.forEach(fn => fn()) },
    listeners: () => Object.values(ls).reduce((n, s) => n + s.size, 0),
    play: vi.fn(function () {
      this.paused = false
      if (rejectPlay) { const e = new Error(rejectPlay); e.name = rejectPlay; return Promise.reject(e) }
      return Promise.resolve()
    }),
    pause: vi.fn(function () { this.paused = true }),
    load: vi.fn(),
  }
}

function fakeTimers() {
  const list = []
  let id = 0
  return {
    setTimeout: vi.fn((f, ms) => { list.push({ id: ++id, f, ms }); return id }),
    clearTimeout: vi.fn(i => { const k = list.findIndex(t => t.id === i); if (k >= 0) list.splice(k, 1) }),
    fire: ms => { const k = list.findIndex(t => t.ms === ms); if (k < 0) throw new Error(`нет таймера ${ms}`); const t = list.splice(k, 1)[0]; t.f() },
    pendingMs: () => list.map(t => t.ms),
  }
}

const noRaf = { raf: () => 0, caf: () => {}, isHidden: () => false }
const timings = [{ word: 'Раз', start: 0.1, end: 0.4 }, { word: 'два', start: 0.5, end: 0.9 }]
const line = { text: 'Раз два', audioUrl: 'https://cdn/a.mp3', wordTimings: timings, audioMeta: { durationMs: 1000 } }

// Якорь и часы файла для кольца (onStarted/onClock) и скорость после src — вынесено из audioLine.test.js (лимит 250 строк)
describe('playLineAudio — якорь, часы, скорость после src', () => {
  it('смена src сбрасывает playbackRate (алгоритм загрузки медиа) — скорость ставится после src и повторяется на playing; onStarted отдаёт реальный остаток', () => {
    const base = fakeAudio(); const t = fakeTimers()
    let srcVal = ''
    const audio = Object.create(base)
    Object.defineProperty(audio, 'src', { get: () => srcVal, set: v => { srcVal = v; audio.playbackRate = audio.defaultPlaybackRate ?? 1 } })
    const onStarted = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, rate: 1.5, onEnd() {}, onStarted })
    expect(audio.src).toBe(line.audioUrl)
    expect(audio.playbackRate).toBe(1.5)
    expect(audio.defaultPlaybackRate).toBe(1.5)
    audio.playbackRate = 1 // браузер сбросил ещё раз (повторная загрузка)
    audio.duration = 3.58; audio.currentTime = 0.08
    base.fire('playing')
    expect(audio.playbackRate).toBe(1.5)
    expect(onStarted).toHaveBeenCalledWith(Math.round((3.58 - 0.08) * 1000 / 1.5))
    base.fire('ended')
  })

  it('onClock: на каждом timeupdate после старта — реальный остаток; до старта молчит', () => {
    const audio = fakeAudio(); const t = fakeTimers()
    const onClock = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, rate: 2, onEnd() {}, onClock })
    audio.duration = 4; audio.currentTime = 1
    audio.fire('timeupdate')
    expect(onClock).not.toHaveBeenCalled()
    audio.fire('playing')
    audio.currentTime = 2
    audio.fire('timeupdate')
    expect(onClock).toHaveBeenLastCalledWith(1000) // (4 − 2) с / rate 2
    audio.fire('ended')
    audio.fire('timeupdate')
    expect(onClock).toHaveBeenCalledTimes(1)
  })

  it('onStarted без длительности → null; второе playing (после буферизации) якорь не повторяет', () => {
    const audio = fakeAudio(); const t = fakeTimers()
    const onStarted = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, rate: 1, onEnd() {}, onStarted })
    audio.fire('playing')
    expect(onStarted).toHaveBeenCalledWith(null)
    audio.fire('waiting'); audio.fire('playing')
    expect(onStarted).toHaveBeenCalledTimes(1)
    audio.fire('ended')
  })

})
