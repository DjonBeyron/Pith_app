import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Хуки React заменены простыми (jsdom в проекте нет): состояния лежат в массиве по порядку вызовов, перерисовки нет — читаем state после start()
const h = vi.hoisted(() => ({ states: [], refs: [], i: 0, j: 0 }))
vi.mock('react', () => ({
  useState: init => { const k = h.i++; if (!(k in h.states)) h.states[k] = typeof init === 'function' ? init() : init; return [h.states[k], v => { h.states[k] = typeof v === 'function' ? v(h.states[k]) : v }] },
  useRef: init => { const k = h.j++; if (!(k in h.refs)) h.refs[k] = { current: init }; return h.refs[k] },
  useCallback: fn => fn,
  useEffect: () => {},
}))
const buffer = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('./takeBuffer.js', () => ({ playTakeBuffer: (...a) => buffer.play(...a) }))

const { useMirrorPlayback, NO_PLAY_TEXT } = await import('./useMirrorPlayback.js')

// Запись играет Web Audio с выравниванием громкости (playTakeBuffer → GainNode), <audio> — запасной путь: iPhone не играл webm/opus, контекст игры мог не запуститься
const spans = { dictor: [], student: [] }
const student = { url: 'blob:take', blob: { size: 4 }, durationMs: 50 }
const fakeAudio = play => ({ currentTime: 0, listeners: {}, addEventListener(e, f) { this.listeners[e] = f }, removeEventListener() {}, pause() {}, play })
const run = async (audio, st = student, extra = {}) => {
  h.i = 0; h.j = 0
  const hook = useMirrorPlayback({ dictor: null, student: st, spans, audioRef: { current: audio }, ...extra })
  await hook.start()
  h.i = 0; h.j = 0
  return useMirrorPlayback({ dictor: null, student: st, spans, audioRef: { current: audio }, ...extra })
}
beforeEach(() => { h.states = []; h.refs = []; buffer.play = vi.fn(async () => 'ended') })

describe('useMirrorPlayback: запись играет через Web Audio, <audio> — запасной путь', () => {
  it('основной путь: буфер Web Audio с целью громкости диктора; <audio> не трогаем, сообщения нет', async () => {
    const play = vi.fn(() => Promise.resolve())
    const r = await run(fakeAudio(play), student, { targetRms: 0.12 })
    expect(buffer.play).toHaveBeenCalledTimes(1)
    expect(buffer.play.mock.calls[0][0]).toBe(student.blob)
    expect(buffer.play.mock.calls[0][1]).toMatchObject({ targetRms: 0.12 })
    expect(play).not.toHaveBeenCalled()
    expect(r.problem).toBe(''); expect(r.phase).toBe('idle')
  })
  it('буфер не вышел (не декодируется / контекст не запустился) — играет <audio>, сообщения нет; повторное «Сравнить» сразу <audio>', async () => {
    buffer.play = vi.fn(async () => 'unsupported')
    const audio = fakeAudio(() => { queueMicrotask(() => audio.listeners.ended?.()); return Promise.resolve() })
    const play = vi.spyOn(audio, 'play')
    const r = await run(audio)
    expect(buffer.play).toHaveBeenCalledTimes(1); expect(play).toHaveBeenCalledTimes(1)
    expect(r.problem).toBe(''); expect(r.phase).toBe('idle')
    await r.start()
    expect(buffer.play).toHaveBeenCalledTimes(1) // буфер второй раз не пробуем
    expect(play).toHaveBeenCalledTimes(2)
  })
  it('<audio> тоже не сыграл (NotSupportedError) — «Запись не воспроизводится на этом устройстве» вместо тихого провала', async () => {
    buffer.play = vi.fn(async () => 'unsupported')
    const r = await run(fakeAudio(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' }))))
    expect(r.problem).toBe(NO_PLAY_TEXT)
    expect(NO_PLAY_TEXT).toBe('Запись не воспроизводится на этом устройстве')
    expect(r.phase).toBe('idle')
  })
  it('нет blob (старый путь) — сразу <audio>', async () => {
    const audio = fakeAudio(() => { queueMicrotask(() => audio.listeners.ended?.()); return Promise.resolve() })
    const r = await run(audio, { url: 'blob:x', durationMs: 50 })
    expect(buffer.play).not.toHaveBeenCalled(); expect(r.problem).toBe('')
  })
})

// Подложки лент наливаются вместе со звуком (onSound → sceneApi.fill): Пит — с задержкой leadMs на длину плана диктора, «ты» — когда пошёл звук записи, на длину записи
describe('useMirrorPlayback: onSound — синхронная заливка подложек', () => {
  it('сброс, потом Пит (leadMs, durationMs диктора), потом «ты» в момент onStart буфера (durationMs записи)', async () => {
    const events = []
    buffer.play = vi.fn(async (blob, o) => { events.push('buffer'); o.onStart(); return 'ended' })
    const dictor = { leadMs: 25, durationMs: 1800, play: async () => { events.push('dictor') } }
    h.i = 0; h.j = 0
    const hook = useMirrorPlayback({ dictor, student, spans, audioRef: { current: null }, onSound: e => events.push(e) })
    await hook.start()
    expect(events).toEqual([null, { side: 'pit', delayMs: 25, durationMs: 1800 }, 'dictor', 'buffer', { side: 'you', delayMs: 0, durationMs: 50 }])
  })
})

// Подсветка кусков на дорожках идёт по времени звука (litSchedule): у Пита — от начала голоса (play() + leadMs), у человека — от старта записи
describe('useMirrorPlayback: какой кусок звучит (lit)', () => {
  afterEach(() => { vi.useRealTimers() })
  const spans = { dictor: [{ i: 0, at: 0, until: 300 }, { i: 1, at: 380, until: 900 }], student: [{ i: 0, at: 400, until: 700 }, { i: 2, at: 1380, until: 2000 }] }
  const dictor = { leadMs: 25, play: () => new Promise(r => setTimeout(r, 1200)) }
  const audio = fakeAudio(() => Promise.resolve())
  const read = () => { h.i = 0; h.j = 0; return useMirrorPlayback({ dictor, student, spans, audioRef: { current: audio } }) }
  it('диктор: кусок горит с leadMs + начало слова и гаснет в конце; после — тишина и фаза idle', async () => {
    vi.useFakeTimers()
    audio.play = () => { queueMicrotask(() => audio.listeners.ended?.()); return Promise.resolve() }
    const run = read().start()
    await vi.advanceTimersByTimeAsync(10)
    expect(read().lit).toEqual({ d: -1, s: -1 }); expect(read().phase).toBe('dictor') // голос Пита ещё молчит (leadMs)
    await vi.advanceTimersByTimeAsync(30); expect(read().lit.d).toBe(0)
    await vi.advanceTimersByTimeAsync(300); expect(read().lit.d).toBe(-1) // 340 мс: кусок 0 кончился (325), кусок 1 ещё не начался (405)
    await vi.advanceTimersByTimeAsync(100); expect(read().lit.d).toBe(1)
    await vi.advanceTimersByTimeAsync(2000); await run
    expect(read()).toMatchObject({ lit: { d: -1, s: -1 }, phase: 'idle' })
  })
})
