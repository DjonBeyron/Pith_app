import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening } from './voskEngine.js'

// Запись голосового ответа в движке: флаг opts.record копит сырой звук потока (включая паузы, которые затвор тишины не отдаёт распознавателю), итог несёт stats.audio;
// без флага audio = null; освобождение сбрасывает буфер. Подставные микрофон, AudioContext и распознаватель (как voskEngineSay.test.js), настоящей модели нет.
function rig({ rate = 16000 } = {}) {
  const handlers = {}
  const rec = {
    on: (name, f) => { handlers[name] = f }, setWords: vi.fn(), acceptWaveform: vi.fn(), remove: vi.fn(),
    retrieveFinalResult: vi.fn(() => { setTimeout(() => handlers.result({ result: { text: 'hello there', result: [] } }), 5) }),
  }
  const track = { stop: vi.fn() }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  class Ctx {
    constructor() { this.sampleRate = rate; this.destination = {}; this.close = vi.fn(async () => {}) }
    createScriptProcessor() { return proc }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
  }
  vi.stubGlobal('window', { AudioContext: Ctx })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } })
  const model = { KaldiRecognizer: function () { return rec } }
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn() }
  const N = 2048
  const voiced = Float32Array.from({ length: N }, (_, i) => 0.3 * Math.sin(i / 4))
  const silent = new Float32Array(N)
  const chunk = data => proc.onaudioprocess({ inputBuffer: { duration: N / rate, getChannelData: () => data } })
  return { rec, model, cb, chunk, voiced, silent, proc }
}

describe('startListening: запись для голосового ответа (opts.record)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  async function speak(r, opts) {
    const h = await startListening(r.model, '[]', r.cb, opts)
    for (let i = 0; i < 12; i++) r.chunk(r.voiced) // ≈1,5 с речи
    for (let i = 0; i < 40; i++) r.chunk(r.silent) // ≈5 с паузы: затвор не отдаёт её распознавателю, но запись её видит
    for (let i = 0; i < 12; i++) r.chunk(r.voiced)
    h.stop()
    r.chunk(r.voiced) // последний кусок после «стоп» → итог
    await vi.advanceTimersByTimeAsync(50)
    return h
  }

  it('record: true → stats.audio = клип WAV; пауза ужата, не растягивает воспроизведение; затвор тишины работает как раньше', async () => {
    const r = rig()
    await speak(r, { record: true, gate: true, maxMs: 20000 })
    expect(r.cb.onResult).toHaveBeenCalledTimes(1)
    const audio = r.cb.onResult.mock.calls[0][1].audio
    expect(audio.ok).toBe(true)
    expect(audio.blob.type).toBe('audio/wav')
    expect(audio.peaks.length).toBeGreaterThanOrEqual(30)
    expect(audio.durationMs).toBeGreaterThan(3000) // 13 × 128 мс + 12 × 128 мс речи + ужатая пауза
    expect(audio.durationMs).toBeLessThan(5000) // исходная пауза ≈ 5 с в запись не попала целиком
    const fed = r.rec.acceptWaveform.mock.calls.length
    expect(fed).toBeLessThan(12 + 40 + 12 + 1) // затвор часть тишины не отдал распознавателю
  })

  it('без record → stats.audio = null (память не тратится)', async () => {
    const r = rig()
    await speak(r, { gate: true })
    expect(r.cb.onResult.mock.calls[0][1].audio).toBeNull()
  })

  it('запись при отключённой частоте 16 кГц (AudioContext 48 кГц) всё равно даёт клип 16 кГц', async () => {
    const r = rig({ rate: 48000 })
    await speak(r, { record: true, gate: true })
    const audio = r.cb.onResult.mock.calls[0][1].audio
    expect(audio.ok).toBe(true)
    expect(audio.durationMs).toBeGreaterThan(900)
  })

  it('cancel() до итога сбрасывает буфер: итога нет, клип не собирается', async () => {
    const r = rig()
    const h = await startListening(r.model, '[]', r.cb, { record: true })
    r.chunk(r.voiced)
    h.cancel()
    await vi.advanceTimersByTimeAsync(50)
    expect(r.cb.onResult).not.toHaveBeenCalled()
  })

  it('сбой записи не ломает распознавание: acceptWaveform идёт, итог приходит', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, { record: true })
    let calls = 0
    // первый вызов getChannelData (для уровня) проходит, а запись получает исключение
    const ev = { inputBuffer: { duration: 0.128, getChannelData: () => { if (++calls > 1) throw new Error('нет данных'); return r.voiced } } }
    expect(() => r.proc.onaudioprocess(ev)).not.toThrow()
    expect(r.rec.acceptWaveform).toHaveBeenCalled()
  })
})
