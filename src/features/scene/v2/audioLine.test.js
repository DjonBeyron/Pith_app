import { describe, it, expect, vi } from 'vitest'
import { playLineAudio, clampRate, knownDurationSec, LOAD_TIMEOUT_MS, RETRY_DELAY_MS, GUARD_MARGIN_MS, STALL_LIMIT_MS } from './audioLine.js'
import { fallbackMs } from './linePlayback.js'

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
const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('playLineAudio — файл озвучки', () => {
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

  it('ставит src/muted/playbackRate, играет; по playing — рот по словам; ended → onEnd и обработчики сняты', async () => {
    const audio = fakeAudio(); const t = fakeTimers()
    const shapes = []; const onEnd = vi.fn(); const onMode = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, muted: true, rate: 1.5, applyMouth: s => shapes.push(s), onEnd, onMode })
    expect(audio.src).toBe(line.audioUrl)
    expect(audio.muted).toBe(true)
    expect(audio.playbackRate).toBe(1.5)
    expect(audio.preservesPitch).toBe(true)
    expect(onMode).toHaveBeenCalledWith('audio')
    expect(t.pendingMs()).toEqual([LOAD_TIMEOUT_MS])
    audio.currentTime = 0.2
    audio.fire('playing')
    expect(shapes.at(-1)).toBe('open')
    // Запасной таймер конца: остаток файла от текущей позиции (durationMs − 0,2 с) / rate + запас
    expect(t.pendingMs()).toEqual([Math.round(800 / 1.5) + GUARD_MARGIN_MS])
    audio.fire('ended')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(shapes.at(-1)).toBe('closed')
    expect(audio.listeners()).toBe(0)
    expect(t.pendingMs()).toEqual([])
    audio.fire('ended') // поздние события — тихо
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('src подменяется blob-ом прогрева; тот же src не переставляется', () => {
    const audio = fakeAudio(); audio.src = 'blob:x'
    playLineAudio(line, audio, { ...noRaf, timers: fakeTimers(), src: 'blob:x' })
    expect(audio.src).toBe('blob:x')
  })

  it('потерянный ended: запасной таймер завершает реплику', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onEnd = vi.fn()
    playLineAudio({ text: 'Раз два', audioUrl: 'https://cdn/a.mp3' }, audio, { ...noRaf, timers: t, onEnd })
    audio.duration = 2 // без audioMeta/wordTimings длительность — из элемента
    audio.fire('playing')
    t.fire(2000 + GUARD_MARGIN_MS)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(audio.pause).toHaveBeenCalled()
  })

  it('без длительности вовсе — запас по оценке текста ×2', () => {
    const audio = fakeAudio(); const t = fakeTimers()
    const l = { text: 'Раз два', audioUrl: 'https://cdn/a.mp3' }
    playLineAudio(l, audio, { ...noRaf, timers: t })
    audio.fire('playing')
    expect(t.pendingMs()).toEqual([fallbackMs(l.text) * 2 + GUARD_MARGIN_MS])
  })

  it('NotAllowedError (нет жеста) → onFail сразу, без повтора; рот закрыт', async () => {
    const audio = fakeAudio({ rejectPlay: 'NotAllowedError' }); const t = fakeTimers()
    const onFail = vi.fn(); const onEnd = vi.fn(); const shapes = []
    playLineAudio(line, audio, { ...noRaf, timers: t, onFail, onEnd, applyMouth: s => shapes.push(s) })
    await flush()
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(onFail).toHaveBeenCalledWith('not-allowed') // причина уходит наверх — для лога и плашки предпросмотра
    expect(onEnd).not.toHaveBeenCalled()
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.listeners()).toBe(0)
    expect(shapes).toEqual([]) // рот не открывался (sync не стартовал)
  })

  it('ошибка сети до старта → одна повторная попытка, вторая ошибка → onFail', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onFail = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onFail })
    audio.error = { code: 2 }
    audio.fire('error')
    expect(onFail).not.toHaveBeenCalled()
    t.fire(RETRY_DELAY_MS)
    expect(audio.load).toHaveBeenCalledTimes(1)
    expect(audio.play).toHaveBeenCalledTimes(2)
    audio.fire('error')
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('404 / не декодируется (code 4) → onFail без повтора', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onFail = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onFail })
    audio.error = { code: 4 }
    audio.fire('error')
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(onFail).toHaveBeenCalledWith('media-error-4')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('не началось за LOAD_TIMEOUT_MS → повтор, снова тишина → onFail', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onFail = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onFail })
    t.fire(LOAD_TIMEOUT_MS)
    t.fire(RETRY_DELAY_MS)
    expect(audio.play).toHaveBeenCalledTimes(2)
    t.fire(LOAD_TIMEOUT_MS)
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(onFail).toHaveBeenCalledWith('load-timeout')
  })

  it('ошибка ПОСЛЕ начала звука → onEnd (диалог идёт дальше), не onFail', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onFail = vi.fn(); const onEnd = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onFail, onEnd })
    audio.fire('playing')
    audio.fire('error')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onFail).not.toHaveBeenCalled()
  })

  it('cancel: пауза, обработчики и таймеры сняты, рот закрыт, поздние события молчат', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onEnd = vi.fn(); const shapes = []
    const cancel = playLineAudio(line, audio, { ...noRaf, timers: t, onEnd, applyMouth: s => shapes.push(s) })
    audio.currentTime = 0.2
    audio.fire('playing')
    cancel()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.listeners()).toBe(0)
    expect(t.pendingMs()).toEqual([])
    expect(shapes.at(-1)).toBe('closed')
    audio.fire('ended')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('новая реплика перехватила общий элемент — cancel старой его не останавливает', () => {
    const audio = fakeAudio(); const t = fakeTimers()
    const cancel1 = playLineAudio(line, audio, { ...noRaf, timers: t })
    playLineAudio({ ...line, audioUrl: 'https://cdn/b.mp3' }, audio, { ...noRaf, timers: t })
    audio.pause.mockClear()
    cancel1()
    expect(audio.pause).not.toHaveBeenCalled()
  })

  it('без wordTimings: ритм синтетический по длительности файла (loadedmetadata уточняет)', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const shapes = []
    playLineAudio({ text: 'Раз два три', audioUrl: 'https://cdn/a.mp3', wordTimings: [{ start: 1, end: 0 }] }, audio, { ...noRaf, timers: t, applyMouth: s => shapes.push(s) })
    audio.duration = 3
    audio.fire('loadedmetadata')
    audio.currentTime = 0.1
    audio.fire('playing')
    expect(shapes.at(-1)).toBe('open')
    expect(t.pendingMs()).toEqual([2900 + GUARD_MARGIN_MS]) // остаток от позиции 0,1 с
  })

  it('без элемента / без audioUrl — сразу onFail; clampRate и knownDurationSec', () => {
    const onFail = vi.fn()
    playLineAudio({ text: 'x' }, fakeAudio(), { onFail })
    playLineAudio({ text: 'x', audioUrl: '/a.mp3' }, null, { onFail })
    expect(onFail).toHaveBeenCalledTimes(2)
    expect(clampRate(0)).toBe(1); expect(clampRate(0.1)).toBe(0.25); expect(clampRate(9)).toBe(4); expect(clampRate('2')).toBe(2)
    expect(knownDurationSec({ audioMeta: { durationMs: 1500 } }, null)).toBe(1.5)
    expect(knownDurationSec({}, timings)).toBe(0.9)
    expect(knownDurationSec({}, null)).toBeNull()
  })
})

describe('playLineAudio — буферизация на слабой сети', () => {
  it('повторный playing после буферизации заменяет запасной таймер (старый не живёт и не обрывает звук)', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onEnd = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onEnd })
    audio.currentTime = 0.1
    audio.fire('playing')
    audio.fire('waiting')
    audio.currentTime = 0.5
    audio.fire('playing')
    expect(t.pendingMs()).toEqual([Math.round(500) + GUARD_MARGIN_MS]) // один таймер — от текущей позиции
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('пока звук буферизуется, запасные часы стоят; дольше STALL_LIMIT_MS — реплика считается сыгранной', () => {
    const audio = fakeAudio(); const t = fakeTimers(); const onEnd = vi.fn()
    playLineAudio(line, audio, { ...noRaf, timers: t, onEnd })
    audio.currentTime = 0.3
    audio.fire('playing')
    audio.fire('waiting')
    expect(t.pendingMs()).toEqual([STALL_LIMIT_MS])
    t.fire(STALL_LIMIT_MS)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
