import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createProbe, TICK_MS } from './wordLaneDebugProbe.js'
import { createWordListener, DEAD_MS } from './wordLaneListen.js'
import { startCatLine } from './wordLaneCatSay.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { scheduleDictor, AUDIO_LATENCY_MS, MIC_BACK_AFTER_MS } from './wordLaneDictorRun.js'
import { gameAudioNote, setGameAudioSink } from '../../../../shared/lib/gameAudioSink.js'

// Режимы iPhone (аудиосессия, глушение дорожки): события в отладке, окно речи Пита, слушатель не считает выключенную дорожку «оглохшей»
afterEach(() => { vi.useRealTimers(); setGameAudioSink(null) })

function env() {
  class Media {
    constructor(over = {}) { this.l = {}; Object.assign(this, { tagName: 'AUDIO', src: 'https://x.test/a.mp3', readyState: 4, muted: false, volume: 1, paused: true, currentTime: 0 }, over) }
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
const kinds = p => p.snapshot().map(e => e.kind)

describe('отладка: аудиосессия, глушение дорожки, громкость воспроизведения', () => {
  it('audio-session и mic-hold из gameAudioNote попадают в журнал пробника; после uninstall — нет', () => {
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    gameAudioNote('audio-session', { mode: 'phases', why: 'phase:speak', requested: 'playback', ok: true, as: 'playback' })
    gameAudioNote('mic-hold', { on: true, mode: 'enabled-false', enabled: false, muted: false, readyState: 'live' })
    const evs = probe.snapshot()
    expect(evs.find(x => x.kind === 'audio-session')).toMatchObject({ as: 'playback', requested: 'playback', ok: true, why: 'phase:speak' })
    expect(evs.find(x => x.kind === 'mic-hold')).toMatchObject({ on: true, enabled: false, muted: false, readyState: 'live' })
    probe.uninstall()
    gameAudioNote('mic-hold', { on: false })
    expect(kinds(probe).filter(k => k === 'mic-hold')).toHaveLength(1)
  })

  it('пока <audio> играет: событие audio-tick раз в TICK_MS с типом сессии, видимостью и громкостью; volumechange / ended / pause записываются; тики кончаются вместе со звуком', () => {
    vi.useFakeTimers()
    const e = env()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const el = new e.Media()
    el.play()                                   // обёртка пробника вешает слушатели
    el.paused = false; el.fire('playing')
    vi.advanceTimersByTime(TICK_MS * 2 + 10)
    el.volume = 0.6; el.fire('volumechange')
    e.nav.audioSession.type = 'playback'
    vi.advanceTimersByTime(TICK_MS)
    const ticks = probe.snapshot().filter(x => x.kind === 'audio-tick')
    expect(ticks).toHaveLength(3)
    expect(ticks[0]).toMatchObject({ as: 'play-and-record', vis: 'visible' })
    expect(ticks[0].els[0]).toMatchObject({ vol: 1, muted: false })
    expect(ticks[2]).toMatchObject({ as: 'playback' })
    expect(ticks[2].els[0].vol).toBe(0.6)
    expect(probe.snapshot().find(x => x.kind === 'volumechange')).toMatchObject({ vol: 0.6 })
    el.fire('ended'); el.fire('pause')
    expect(kinds(probe)).toEqual(expect.arrayContaining(['ended', 'pause']))
    vi.advanceTimersByTime(TICK_MS * 4)
    expect(probe.snapshot().filter(x => x.kind === 'audio-tick')).toHaveLength(3)
    probe.uninstall()
  })
})

describe('слушатель и выключенная нами дорожка', () => {
  function run(isHeld) {
    let now = 0
    let cb = null
    const seen = []
    const listen = async (model, grammar, callbacks) => { cb = callbacks; queueMicrotask(() => callbacks.onReady?.()); return { stop() {}, cancel() {} } }
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s.status), runtime: { getModel: () => ({}) }, listen, now: () => now, isHeld })
    l.start()
    return { l, seen, level(v, at) { now = at; cb.onLevel(v) }, flush: () => new Promise(r => setTimeout(r, 0)) }
  }
  it('ровная тишина дольше DEAD_MS — «оглох», если дорожку не глушили; пока она выключена игрой (isHeld), не считается', async () => {
    const a = run(() => false)
    await a.flush()
    a.level(0, 1000); a.level(0, 1000 + DEAD_MS + 10)
    expect(a.seen).toContain('dead')
    a.l.dispose()
    let held = true
    const b = run(() => held)
    await b.flush()
    b.level(0, 1000); b.level(0, 1000 + DEAD_MS + 10)
    expect(b.seen).not.toContain('dead')
    held = false                                  // дорожку вернули: отсчёт тишины начинается заново, не с момента глушения
    b.level(0, 1000 + DEAD_MS + 20)
    b.level(0, 1000 + DEAD_MS + 30)
    expect(b.seen).not.toContain('dead')
    b.l.dispose()
  })
})

describe('реплика Пита открывает окно речи', () => {
  const lines = normalizeLines({ lines: { your_turn: { text: 'Теперь твоя очередь', url: 'https://x/a.mp3', duration: 2, words: [] } } })
  const mk = (over = {}) => ({ id: 'your_turn', line: lines.your_turn, catApi: { current: { isUp: () => true, peek() {}, speak() {} } }, listenerRef: { current: { mute() {} } }, has: () => true, play: (k, r, onStart) => { onStart?.(); return true }, log: () => {}, ...over })
  it('звук пошёл — holdFor(длина реплики); нет озвучки или play() отказал — окно не открывается', () => {
    const hold = { holdFor: vi.fn() }
    startCatLine(mk({ hold }))
    expect(hold.holdFor).toHaveBeenCalledWith(2000)
    const silent = { holdFor: vi.fn() }
    startCatLine(mk({ hold: silent, has: () => false }))
    startCatLine(mk({ hold: silent, play: () => false }))
    expect(silent.holdFor).not.toHaveBeenCalled()
  })
  it('голова спрятана: окно открывается, когда звук реально стартует (через CAT_RISE_MS), а не сразу', () => {
    const hold = { holdFor: vi.fn() }
    const timers = []
    startCatLine(mk({ hold, catApi: { current: { isUp: () => false, peek() {}, speak() {} } }, setTimer: fn => timers.push(fn) }))
    expect(hold.holdFor).not.toHaveBeenCalled()
    timers[0]()
    expect(hold.holdFor).toHaveBeenCalledTimes(1)
  })
})

describe('диктор: окно речи на ступень', () => {
  const plan = { listenMs: 4800, reps: [{ at: 1000, ms: 800, mode: 'words', pieces: [{ at: 1000, chunk: 0, lead: 0 }] }, { at: 3000, ms: 900, mode: 'clip', row: {}, pieces: [{ at: 3000 }] }] }
  const mk = () => {
    vi.useFakeTimers()
    const ids = []
    const hold = { begin: vi.fn(), end: vi.fn() }
    const look = { lineStart: vi.fn(), word: vi.fn() }
    const f = { sayClip: vi.fn(), sayChunk: vi.fn(), next: vi.fn() }
    const release = scheduleDictor({ plan, left: at => at, look: () => look, ids, hold, ...f })
    return { ids, hold, look, release, ...f }
  }
  it('окно открывается сразу, звук повторов идёт по плану с опережением, окно закрывается через MIC_BACK_AFTER_MS после последнего повтора (задолго до слушателя), ступень кончается по listenMs', () => {
    const m = mk()
    expect(m.hold.begin).toHaveBeenCalledTimes(1)
    expect(m.look.lineStart).toHaveBeenCalled()
    vi.advanceTimersByTime(1000 - AUDIO_LATENCY_MS)
    expect(m.sayChunk).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(3000 - AUDIO_LATENCY_MS - (1000 - AUDIO_LATENCY_MS))
    expect(m.sayClip).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3900 + MIC_BACK_AFTER_MS - (3000 - AUDIO_LATENCY_MS) - 1)
    expect(m.hold.end).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(m.hold.end).toHaveBeenCalledTimes(1)       // последний повтор кончился в 3900, дорожка вернулась в 4050
    expect(m.next).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4800 - 4050)
    expect(m.next).toHaveBeenCalledTimes(1)
    m.release()                                        // смена стадии после таймера: второго end нет
    expect(m.hold.end).toHaveBeenCalledTimes(1)
  })
  it('стадия оборвана раньше (пропуск, выход): release закрывает окно один раз, таймер потом его не закрывает повторно', () => {
    const m = mk()
    m.ids.forEach(clearTimeout)
    m.release(); m.release()
    expect(m.hold.end).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(6000)
    expect(m.hold.end).toHaveBeenCalledTimes(1)
  })
})

describe('игра: подключение режимов', () => {
  const flow = readFileSync(new URL('./useWordLaneFlow.js', import.meta.url), 'utf8')
  it('диктор открывает окно речи через scheduleDictor; конец игры и размонтирование сбрасывают окна и возвращают тип сессии; слушатель знает про выключенную дорожку', () => {
    expect(flow).toContain('releaseHold = scheduleDictor(')
    expect(flow).toContain('releaseHold?.()')
    expect(flow).toMatch(/endGameAudio\(\); closeGameMic\(\)/)
    expect(flow).toContain('isHeld: gameMicHold.active')
    expect(flow).toContain('useGameAudioModes(')
  })
  it('подсказки диктора («Порядок», «Различи») тоже открывают окно речи на свою длину', () => {
    expect(flow).toContain('gameMicHold.holdFor(sayMs)')
    expect(flow).toContain('gameMicHold.holdFor(total)')
  })
  it('тап «Начать» ставит тип аудиосессии до открытия микрофона', () => {
    const start = readFileSync(new URL('./wordLaneStart.js', import.meta.url), 'utf8')
    const body = start.slice(start.indexOf('export function startGameAudio'))
    expect(body.indexOf('session.begin()')).toBeGreaterThan(0)
    expect(body.indexOf('session.begin()')).toBeLessThan(body.indexOf('openMic()'))
  })
})
