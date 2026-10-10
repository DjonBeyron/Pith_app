import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening, bufferRms } from './voskEngine.js'

// Движок Vosk для модуля «Сказать фразу»: колбэки onReady / onLevel, размер куска, ОДИН getUserMedia, полное освобождение микрофона, AudioContext и аудиосессии
// (после попытки следующая — и Vosk, и системная — не должна оказаться «глухой»). Подставные микрофон, AudioContext и распознаватель, настоящей модели нет.
function rig({ audioSession, kaldiThrows = false } = {}) {
  const handlers = {}
  const rec = {
    on: (name, f) => { handlers[name] = f }, setWords: vi.fn(), acceptWaveform: vi.fn(), remove: vi.fn(),
    retrieveFinalResult: vi.fn(() => { setTimeout(() => handlers.result({ result: { text: 'try', result: [] } }), 10) }),
  }
  const track = { stop: vi.fn() }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  const made = { ctx: null, chunk: null }
  class Ctx {
    constructor() { this.sampleRate = 16000; this.destination = {}; this.close = vi.fn(async () => {}); made.ctx = this }
    createScriptProcessor(size) { made.chunk = size; return proc }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
  }
  vi.stubGlobal('window', { AudioContext: Ctx })
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, audioSession })
  const model = { KaldiRecognizer: function () { if (kaldiThrows) throw new Error('модель выгружена'); return rec } }
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn(), onReady: vi.fn(), onLevel: vi.fn() }
  const chunk = (samples = [0.5, -0.5, 0.5, -0.5]) => proc.onaudioprocess({ inputBuffer: { duration: 0.128, getChannelData: () => Float32Array.from(samples) } })
  return { rec, track, model, cb, handlers, chunk, made, getUserMedia, proc }
}

describe('bufferRms', () => {
  it('RMS первого канала 0..1; тишина и мусор — 0', () => {
    expect(bufferRms({ getChannelData: () => Float32Array.from([0.5, -0.5, 0.5, -0.5]) })).toBeCloseTo(0.5, 5)
    expect(bufferRms({ getChannelData: () => new Float32Array(8) })).toBe(0)
    expect(bufferRms({ getChannelData: () => Float32Array.from([2, 2]) })).toBe(1)
    expect(bufferRms({ duration: 0.1 })).toBe(0)
    expect(bufferRms(null)).toBe(0)
    expect(bufferRms({ getChannelData() { throw new Error('x') } })).toBe(0)
  })
})

describe('startListening: уровень голоса, готовность, освобождение', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('onReady — микрофон открыт и граф собран (до первого куска); onLevel — RMS каждого куска; второго getUserMedia нет', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, { autoStopMs: 800 })
    expect(r.cb.onReady).toHaveBeenCalledTimes(1)
    expect(r.cb.onReady.mock.calls[0][0]).toHaveProperty('micMs')
    expect(r.cb.onLevel).not.toHaveBeenCalled()
    r.chunk([0.5, -0.5, 0.5, -0.5]); r.chunk([0.1, -0.1, 0.1, -0.1])
    expect(r.cb.onLevel.mock.calls.map(c => Number(c[0].toFixed(2)))).toEqual([0.5, 0.1]) // с первого же куска, без задержки событий
    expect(r.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('исключение в onLevel / onReady не ломает запись', async () => {
    const r = rig()
    r.cb.onLevel = vi.fn(() => { throw new Error('x') }); r.cb.onReady = vi.fn(() => { throw new Error('y') })
    await startListening(r.model, '[]', r.cb, {})
    expect(() => r.chunk()).not.toThrow()
    expect(r.rec.acceptWaveform).toHaveBeenCalledTimes(1)
  })

  it('размер куска: 2048 по просьбе модуля, иначе 4096 (мусор → 4096)', async () => {
    const a = rig(); await startListening(a.model, '[]', a.cb, { chunk: 2048 }); expect(a.made.chunk).toBe(2048)
    const b = rig(); await startListening(b.model, '[]', b.cb, {}); expect(b.made.chunk).toBe(4096)
    const c = rig(); await startListening(c.model, '[]', c.cb, { chunk: 7 }); expect(c.made.chunk).toBe(4096)
  })

  it('итог → микрофон выключен, AudioContext закрыт, распознаватель удалён, аудиосессия снова auto', async () => {
    const audioSession = { type: 'auto' }
    const r = rig({ audioSession })
    await startListening(r.model, '[]', r.cb, { session: 'play-and-record', autoStopMs: 800 })
    expect(audioSession.type).toBe('play-and-record')
    await vi.advanceTimersByTimeAsync(100)
    r.handlers.result({ result: { text: 'try', result: [] } })
    expect(r.track.stop).toHaveBeenCalled()
    expect(r.made.ctx.close).toHaveBeenCalledTimes(1)
    expect(r.rec.remove).toHaveBeenCalled()
    expect(r.proc.disconnect).toHaveBeenCalled()
    expect(audioSession.type).toBe('auto')
  })

  it('«Стоп» → итог пришёл → всё освобождено; cancel() до итога освобождает тоже, повторный cancel безопасен', async () => {
    const r = rig({ audioSession: { type: 'auto' } })
    const h = await startListening(r.model, '[]', r.cb, { session: 'play-and-record' })
    h.stop()
    await vi.advanceTimersByTimeAsync(320) // тап ждёт последний кусок звука (до DRAIN_MAX_MS), потом итог
    expect(r.cb.onResult).toHaveBeenCalledTimes(1)
    expect(r.made.ctx.close).toHaveBeenCalledTimes(1)
    const r2 = rig({ audioSession: { type: 'auto' } })
    const h2 = await startListening(r2.model, '[]', r2.cb, { session: 'play-and-record' })
    h2.cancel(); h2.cancel()
    expect(r2.track.stop).toHaveBeenCalled()
    expect(r2.made.ctx.close).toHaveBeenCalledTimes(1)
    expect(navigator.audioSession.type).toBe('auto')
    expect(r2.cb.onResult).not.toHaveBeenCalled() // после cancel итог не нужен
  })

  it('сбой настройки после открытия микрофона (модель уже выгружена): микрофон, контекст и аудиосессия отпущены, ошибка летит наружу', async () => {
    const audioSession = { type: 'auto' }
    const r = rig({ audioSession, kaldiThrows: true })
    await expect(startListening(r.model, '[]', r.cb, { session: 'play-and-record' })).rejects.toThrow('модель выгружена')
    expect(r.track.stop).toHaveBeenCalled()
    expect(r.made.ctx.close).toHaveBeenCalledTimes(1)
    expect(audioSession.type).toBe('auto')
  })
})
