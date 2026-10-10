import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening } from './voskEngine.js'

// Подставные микрофон, AudioContext и распознаватель Vosk: проверяем авто-стоп, тайминги и аудиосессию без настоящей модели
function rig({ audioSession } = {}) {
  const handlers = {}
  const rec = {
    on: (name, f) => { handlers[name] = f }, setWords: vi.fn(), acceptWaveform: vi.fn(), remove: vi.fn(),
    retrieveFinalResult: vi.fn(() => { setTimeout(() => handlers.result({ result: { text: rec.finalText, result: rec.finalWords } }), 50) }),
    finalText: 'try', finalWords: [{ word: 'try', conf: 1, start: 1.0, end: 1.5 }],
  }
  const track = { stop: vi.fn() }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  class Ctx {
    constructor() { this.sampleRate = 16000; this.destination = {} }
    createScriptProcessor() { return proc }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
    close() {}
  }
  vi.stubGlobal('window', { AudioContext: Ctx })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) }, audioSession })
  const model = { KaldiRecognizer: function () { return rec } }
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn() }
  const chunk = () => proc.onaudioprocess({ inputBuffer: { duration: 0.256 } })
  const partial = text => handlers.partialresult({ result: { partial: text } })
  return { rec, track, model, cb, handlers, chunk, partial }
}

describe('startListening: авто-стоп и тайминги', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('авто-стоп: partial «try» не менялся 800 мс → сами просим итог; stopBy=auto, старт звука и «после слова»', async () => {
    const r = rig()
    const h = await startListening(r.model, '["try","[unk]"]', r.cb, { autoStopMs: 800, maxMs: 10000 })
    await vi.advanceTimersByTimeAsync(400); r.chunk() // первый кусок звука на 400 мс
    await vi.advanceTimersByTimeAsync(1100); r.partial('try') // 1500 мс — первый partial
    await vi.advanceTimersByTimeAsync(600) // +600 мс тишины — рано
    expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300) // +900 мс — пора
    expect(r.rec.retrieveFinalResult).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(r.cb.onResult).toHaveBeenCalledTimes(1)
    const [text, st] = r.cb.onResult.mock.calls[0]
    expect(text).toBe('try')
    expect(st).toMatchObject({ stopBy: 'auto', firstPartialMs: 1500, session: null })
    expect(st.audioStartMs).toBe(400 - 256)
    expect(st.readyMs).toBe(400 - 256)
    expect(st.words).toHaveLength(1)
    expect(r.track.stop).toHaveBeenCalled()
    h.cancel()
  })

  it('пока partial меняется, авто-стоп не срабатывает', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, { autoStopMs: 800 })
    for (const t of ["i'm", "i'm try", "i'm try to"]) { await vi.advanceTimersByTimeAsync(600); r.partial(t) }
    await vi.advanceTimersByTimeAsync(500)
    expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled()
  })

  it('без авто-стопа (0) молчание ничего не останавливает; «Стоп» руками — stopBy=manual', async () => {
    const r = rig()
    const h = await startListening(r.model, '[]', r.cb, { autoStopMs: 0 })
    await vi.advanceTimersByTimeAsync(300); r.partial('try')
    await vi.advanceTimersByTimeAsync(5000)
    expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled()
    h.stop()
    await vi.advanceTimersByTimeAsync(400) // ожидание последнего куска звука до 300 мс + итог через 50 мс
    expect(r.cb.onResult.mock.calls[0][1]).toMatchObject({ stopBy: 'manual' })
    expect(r.cb.onResult.mock.calls[0][1].afterStopMs).toBeGreaterThanOrEqual(50)
  })

  it('потолок записи (тишина 3 с): итог пустой, stopBy=max', async () => {
    const r = rig()
    r.rec.finalText = ''; r.rec.finalWords = []
    await startListening(r.model, '[]', r.cb, { maxMs: 3000 })
    await vi.advanceTimersByTimeAsync(2900)
    expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(r.cb.onResult).toHaveBeenCalledTimes(1)
    expect(r.cb.onResult.mock.calls[0][0]).toBe('')
    expect(r.cb.onResult.mock.calls[0][1]).toMatchObject({ stopBy: 'max' })
  })

  it('итог от самого движка (endpoint) — stopBy=endpoint', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, { autoStopMs: 800 })
    await vi.advanceTimersByTimeAsync(500)
    r.handlers.result({ result: { text: 'trying', result: [] } })
    expect(r.cb.onResult.mock.calls[0][1].stopBy).toBe('endpoint')
  })

  it('аудиосессия play-and-record на время записи и возврат в auto', async () => {
    const audioSession = { type: 'auto' }
    const r = rig({ audioSession })
    await startListening(r.model, '[]', r.cb, { session: 'play-and-record', autoStopMs: 800 })
    expect(audioSession.type).toBe('play-and-record')
    await vi.advanceTimersByTimeAsync(100)
    r.handlers.result({ result: { text: 'try', result: [] } })
    expect(audioSession.type).toBe('auto')
    expect(r.cb.onResult.mock.calls[0][1].session).toBe('play-and-record')
  })

  it('без navigator.audioSession опция молча пропускается; отказ микрофона возвращает аудиосессию', async () => {
    const r = rig()
    await expect(startListening(r.model, '[]', r.cb, { session: 'play-and-record' })).resolves.toBeTruthy()
    const audioSession = { type: 'auto' }
    const r2 = rig({ audioSession })
    navigator.mediaDevices.getUserMedia = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) })
    await expect(startListening(r2.model, '[]', r2.cb, { session: 'play-and-record' })).rejects.toThrow('x')
    expect(audioSession.type).toBe('auto')
  })
})
