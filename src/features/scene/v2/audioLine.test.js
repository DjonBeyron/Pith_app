import { describe, it, expect, vi } from 'vitest'
import { wordsPassed, playLineAudio } from './audioLine.js'
import { fallbackMs, timerSpeak } from './linePlayback.js'

// Поддельный <audio>: play() — промис, currentTime двигаем руками
function fakeAudio({ rejectPlay = false } = {}) {
  return {
    src: '', currentTime: 0, paused: true, onended: null, onerror: null,
    play() {
      this.paused = false
      return rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()
    },
    pause: vi.fn(function () { this.paused = true }),
  }
}

// rAF руками: step() — один кадр
function fakeRaf() {
  let cb = null
  return {
    raf: vi.fn(f => { cb = f; return 1 }),
    caf: vi.fn(() => { cb = null }),
    step: () => { const f = cb; cb = null; f?.() },
    pending: () => cb !== null,
  }
}

const timings = [
  { word: 'Дымка', start: 0, end: 0.4 },
  { word: 'у', start: 0.5, end: 0.6 },
  { word: 'нас', start: 0.7, end: 1.0 },
]

describe('wordsPassed', () => {
  it('сколько слов началось к моменту t, с продолжением от from', () => {
    expect(wordsPassed(timings, 0)).toBe(1)
    expect(wordsPassed(timings, 0.55)).toBe(2)
    expect(wordsPassed(timings, 5)).toBe(3)
    expect(wordsPassed(timings, 0.9, 2)).toBe(3)
    expect(wordsPassed([], 1)).toBe(0)
  })
})

describe('playLineAudio', () => {
  it('ставит src, играет, дёргает onWord по таймингам через rAF, onEnd по ended', async () => {
    const audio = fakeAudio()
    const r = fakeRaf()
    const onWord = vi.fn(), onEnd = vi.fn(), onMode = vi.fn()
    const line = { text: 'Дымка у нас', audioUrl: 'https://cdn/a.mp3', wordTimings: timings }
    playLineAudio(line, audio, { onWord, onEnd, onMode, raf: r.raf, caf: r.caf })
    expect(audio.src).toBe(line.audioUrl)
    expect(audio.paused).toBe(false)
    expect(onMode).toHaveBeenCalledWith('audio')
    r.step() // t=0 → первое слово
    expect(onWord).toHaveBeenCalledTimes(1)
    audio.currentTime = 0.55
    r.step()
    expect(onWord).toHaveBeenCalledTimes(2)
    audio.currentTime = 0.56
    r.step()
    expect(onWord).toHaveBeenCalledTimes(2) // то же слово — без повтора
    audio.onended()
    await Promise.resolve()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(r.caf).toHaveBeenCalled()
    expect(r.pending()).toBe(false)
  })

  it('cancel останавливает аудио и опрос; поздний ended не зовёт onEnd', () => {
    const audio = fakeAudio()
    const r = fakeRaf()
    const onEnd = vi.fn()
    const cancel = playLineAudio({ text: 'x', audioUrl: '/a.mp3', wordTimings: timings }, audio, { onEnd, raf: r.raf, caf: r.caf })
    const ended = audio.onended
    cancel()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.onended).toBeNull()
    ended?.()
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('запрет автозапуска (play отклонён) и ошибка загрузки → onFail, не onEnd', async () => {
    const r = fakeRaf()
    const onFail = vi.fn(), onEnd = vi.fn()
    playLineAudio({ text: 'x', audioUrl: '/a.mp3' }, fakeAudio({ rejectPlay: true }), { onFail, onEnd, raf: r.raf, caf: r.caf })
    await Promise.resolve(); await Promise.resolve()
    expect(onFail).toHaveBeenCalledTimes(1)
    const a2 = fakeAudio()
    const onFail2 = vi.fn()
    playLineAudio({ text: 'x', audioUrl: '/b.mp3' }, a2, { onFail: onFail2, onEnd, raf: r.raf, caf: r.caf })
    a2.onerror()
    expect(onFail2).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('без audioUrl или без элемента — сразу onFail', () => {
    const onFail = vi.fn()
    playLineAudio({ text: 'x' }, fakeAudio(), { onFail })
    playLineAudio({ text: 'x', audioUrl: '/a.mp3' }, null, { onFail })
    expect(onFail).toHaveBeenCalledTimes(2)
  })

  it('без wordTimings рот идёт по таймеру (setInterval), не по rAF', () => {
    vi.useFakeTimers()
    const r = fakeRaf()
    const onWord = vi.fn()
    const cancel = playLineAudio({ text: 'Раз два три четыре', audioUrl: '/a.mp3' }, fakeAudio(), { onWord, raf: r.raf, caf: r.caf })
    expect(r.raf).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(onWord.mock.calls.length).toBeGreaterThan(2)
    cancel()
    vi.useRealTimers()
  })
})

describe('запасной таймер (linePlayback)', () => {
  it('длительность ≥ 1.2 с, ~65 мс/символ, делится на rate', () => {
    expect(fallbackMs('')).toBe(1200)
    expect(fallbackMs('а'.repeat(40))).toBe(40 * 65 + 500)
    expect(fallbackMs('а'.repeat(40), 2)).toBe(Math.round((40 * 65 + 500) / 2))
  })

  it('timerSpeak: onWord примерно на слово, onEnd в конце, cancel глушит', () => {
    vi.useFakeTimers()
    const onWord = vi.fn(), onEnd = vi.fn()
    const text = 'Раз два три четыре пять'
    timerSpeak(text, 1, { onWord, onEnd })
    vi.advanceTimersByTime(fallbackMs(text) + 10)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onWord.mock.calls.length).toBeGreaterThanOrEqual(4)
    const onEnd2 = vi.fn()
    const cancel = timerSpeak(text, 1, { onEnd: onEnd2 })
    cancel()
    vi.advanceTimersByTime(10000)
    expect(onEnd2).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
