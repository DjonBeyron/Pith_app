import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// «Сравнить» на iPhone: <audio> не играет webm/opus (play() → NotSupportedError). Раньше запись молча не звучала; теперь — запасной путь (буфер Web Audio) и честное сообщение, если не вышло и он
const view = { dictor: { pills: [] }, student: { pills: [] } }
const student = { url: 'blob:take', blob: { size: 4 }, durationMs: 50 }
const fakeAudio = play => ({ currentTime: 0, listeners: {}, addEventListener(e, f) { this.listeners[e] = f }, removeEventListener() {}, pause() {}, play })
const run = async (audio, st = student) => {
  h.i = 0; h.j = 0
  const hook = useMirrorPlayback({ dictor: null, student: st, view, audioRef: { current: audio } })
  await hook.start()
  h.i = 0; h.j = 0
  return useMirrorPlayback({ dictor: null, student: st, view, audioRef: { current: audio } })
}
beforeEach(() => { h.states = []; h.refs = []; buffer.play = vi.fn(async () => 'ended') })

describe('useMirrorPlayback: запись не играет в <audio>', () => {
  it('play() отклонён (NotSupportedError) — играет буфер Web Audio, сообщения нет; повторное «Сравнить» сразу буфером', async () => {
    const play = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' })))
    const audio = fakeAudio(play)
    const r = await run(audio)
    expect(buffer.play).toHaveBeenCalledWith(student.blob)
    expect(r.problem).toBe('')
    expect(r.phase).toBe('idle')
    await r.start()
    expect(play).toHaveBeenCalledTimes(1)   // <audio> второй раз не пробуем
    expect(buffer.play).toHaveBeenCalledTimes(2)
  })
  it('буфер тоже не вышел — «Запись не воспроизводится на этом устройстве» вместо тихого провала', async () => {
    buffer.play = vi.fn(async () => 'unsupported')
    const r = await run(fakeAudio(() => Promise.reject(new Error('NotSupportedError'))))
    expect(r.problem).toBe(NO_PLAY_TEXT)
    expect(NO_PLAY_TEXT).toBe('Запись не воспроизводится на этом устройстве')
    expect(r.phase).toBe('idle')
  })
  it('<audio> сыграл (ended) — запасной путь не нужен', async () => {
    const audio = fakeAudio(() => { queueMicrotask(() => audio.listeners.ended?.()); return Promise.resolve() })
    const r = await run(audio)
    expect(buffer.play).not.toHaveBeenCalled()
    expect(r.problem).toBe('')
  })
})
