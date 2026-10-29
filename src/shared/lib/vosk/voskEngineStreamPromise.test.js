import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening } from './voskEngine.js'

// opts.stream может быть ОБЕЩАНИЕМ потока (игра в режиме «микрофон только в фазе ученика» открывает микрофон заново, gameMic.getGameMic): движок ждёт его и не открывает свой микрофон с эхо/шумоподавлением
function rig() {
  const rec = { on: vi.fn(), setWords: vi.fn(), acceptWaveform: vi.fn(), remove: vi.fn(), retrieveFinalResult: vi.fn() }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  const sources = []
  class Ctx {
    constructor() { this.sampleRate = 16000; this.destination = {}; this.close = vi.fn(async () => {}) }
    createScriptProcessor() { return proc }
    createMediaStreamSource(s) { sources.push(s); return { connect: vi.fn(), disconnect: vi.fn() } }
  }
  vi.stubGlobal('window', { AudioContext: Ctx })
  const ownTrack = { stop: vi.fn() }
  const getUserMedia = vi.fn(async () => ({ id: 'own', getTracks: () => [ownTrack] }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const model = { KaldiRecognizer: function () { return rec } }
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn(), onReady: vi.fn() }
  return { model, cb, getUserMedia, sources, ownTrack }
}
const gameStream = () => { const t = { stop: vi.fn() }; return { id: 'game', getTracks: () => [t], t } }

describe('startListening: обещание потока в opts.stream', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('обещание разрешилось потоком — запись идёт на нём, getUserMedia не зовётся, треки не останавливаются (поток игры чужой)', async () => {
    const r = rig(); const s = gameStream()
    const h = await startListening(r.model, '[]', r.cb, { stream: Promise.resolve(s), autoStopMs: 800 })
    expect(r.getUserMedia).not.toHaveBeenCalled()
    expect(r.sources).toEqual([s])
    h.cancel()
    expect(s.t.stop).not.toHaveBeenCalled()
  })

  it('обещание разрешилось null (повторное открытие не удалось) — движок открывает свой микрофон и сам же его останавливает', async () => {
    const r = rig()
    const h = await startListening(r.model, '[]', r.cb, { stream: Promise.resolve(null), autoStopMs: 800 })
    expect(r.getUserMedia).toHaveBeenCalledTimes(1)
    expect(r.sources[0]).toMatchObject({ id: 'own' })
    h.cancel()
    expect(r.ownTrack.stop).toHaveBeenCalled()
  })

  it('обычный готовый поток работает как раньше', async () => {
    const r = rig(); const s = gameStream()
    await startListening(r.model, '[]', r.cb, { stream: s })
    expect(r.getUserMedia).not.toHaveBeenCalled()
    expect(r.sources).toEqual([s])
  })
})
