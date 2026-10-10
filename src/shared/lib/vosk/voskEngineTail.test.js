import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening } from './voskEngine.js'
import { feedSilence } from './voskTail.js'
import { TAIL_SILENCE_MS, DRAIN_MAX_MS } from './voskTiming.js'
import { cleanResult } from './voskResult.js'

// Потеря последнего слова («both»): подставной Vosk-декодер ведёт себя как настоящий в одном важном месте — слабое КОНЕЧНОЕ слово он выдаёт, только если после него
// увидел тишину (модель декодера — допущение по поведению Vosk, настоящую модель в тестах не запустить). Проверяем порядок остановки: последний кусок звука → тишина → итог.
const SR = 16000
const VOICE = Float32Array.from([0.4, -0.4, 0.4, -0.4])

function rig() {
  const handlers = {}
  const log = []
  const sim = { voiceChunks: 0, silenceMs: 0 }
  const rec = {
    on: (n, f) => { handlers[n] = f }, setWords: vi.fn(), remove: vi.fn(),
    acceptWaveform: vi.fn(buf => { const d = buf.getChannelData(0); const quiet = d.every(x => x === 0); log.push(quiet ? `silence ${d.length}` : 'voice'); if (quiet) sim.silenceMs += (d.length / SR) * 1000; else sim.voiceChunks++ }),
    retrieveFinalResult: vi.fn(() => {
      log.push('retrieve')
      const words = sim.words()
      setTimeout(() => handlers.result?.({ result: { text: words.map(w => w.word).join(' '), result: words } }), 20)
    }),
  }
  // 3 куска голоса = «i'm trying to please», 4-й кусок = «both»; слово «both» выходит, только если после него была тишина ≥ 300 мс
  sim.words = () => {
    const words = [{ word: "i'm", conf: 0.9 }, { word: 'trying', conf: 0.9 }, { word: 'to', conf: 0.9 }, { word: 'please', conf: 0.9 }]
    if (sim.voiceChunks >= 4 && sim.silenceMs >= 300) words.push({ word: 'both', conf: 0.8 })
    return words
  }
  const track = { stop: vi.fn(() => log.push('tracks stop')) }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  class Ctx {
    constructor() { this.sampleRate = SR; this.destination = {}; this.close = vi.fn(async () => {}) }
    createScriptProcessor() { return proc }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
  }
  vi.stubGlobal('window', { AudioContext: Ctx })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } })
  const model = { KaldiRecognizer: function () { return rec } }
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn() }
  const chunk = (samples = VOICE) => proc.onaudioprocess({ inputBuffer: { duration: 0.128, getChannelData: () => samples } })
  return { rec, track, model, cb, handlers, chunk, log, sim }
}

describe('feedSilence: тишина в хвост записи', () => {
  it('нулевые сэмплы нужной длины; acceptWaveformFloat, а без него acceptWaveform(AudioBuffer-подобный); сбой не роняет', () => {
    const f = { acceptWaveformFloat: vi.fn() }
    expect(feedSilence(f, 16000, 400)).toBe(400)
    const [arr, rate] = f.acceptWaveformFloat.mock.calls[0]
    expect(arr.length).toBe(6400); expect(rate).toBe(16000); expect(arr.every(x => x === 0)).toBe(true)
    const g = { acceptWaveform: vi.fn() }
    expect(feedSilence(g, 48000, 400)).toBe(400)
    expect(g.acceptWaveform.mock.calls[0][0].getChannelData(0).length).toBe(19200)
    expect(feedSilence({ acceptWaveform: () => { throw new Error('x') } }, 16000, 400)).toBe(0)
    expect(feedSilence(g, 16000, 0)).toBe(0); expect(feedSilence(null, 16000, 400)).toBe(0)
  })
})

describe('остановка Vosk: хвост речи не теряется', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('модель декодера: без хвоста тишины «both» теряется (так было — итог сразу после обрыва звука), через движок с хвостом выходит', async () => {
    const legacy = rig() // старый порядок: звук оборвали и сразу просим итог
    for (let i = 0; i < 4; i++) legacy.rec.acceptWaveform({ getChannelData: () => VOICE })
    expect(legacy.sim.words().map(w => w.word)).toEqual(["i'm", 'trying', 'to', 'please'])
    const r = rig()
    await startListening(r.model, '[]', r.cb, { autoStopMs: 800 })
    for (let i = 0; i < 4; i++) r.chunk()
    r.handlers.partialresult({ result: { partial: "i'm trying to please" } })
    await vi.advanceTimersByTimeAsync(950)
    expect(r.cb.onResult).toHaveBeenCalledTimes(1)
    expect(r.cb.onResult.mock.calls[0][0]).toContain('both')
  })

  it('авто-стоп: микрофон выключается, затем TAIL_SILENCE_MS тишины, затем итог (и в таком порядке); статистика знает, сколько досылали', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, { autoStopMs: 800 })
    for (let i = 0; i < 4; i++) r.chunk()
    r.handlers.partialresult({ result: { partial: "i'm trying to please" } })
    await vi.advanceTimersByTimeAsync(850)
    expect(r.log.slice(0, 7)).toEqual(['voice', 'voice', 'voice', 'voice', 'tracks stop', `silence ${(SR * TAIL_SILENCE_MS) / 1000}`, 'retrieve'])
    await vi.advanceTimersByTimeAsync(30)
    const [text, st] = r.cb.onResult.mock.calls[0]
    expect(text).toBe("i'm trying to please both")
    expect(st).toMatchObject({ stopBy: 'auto', tailMs: TAIL_SILENCE_MS })
    expect(st.words.at(-1).word).toBe('both')
  })

  it('тап: ждём ещё один кусок звука (в нём может быть конец слова), только потом микрофон выключается, тишина и итог; кусок после итога игнорируется', async () => {
    const r = rig()
    const h = await startListening(r.model, '[]', r.cb, {})
    for (let i = 0; i < 3; i++) r.chunk()
    h.stop()
    expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled(); expect(r.track.stop).not.toHaveBeenCalled() // ждём последний кусок
    await vi.advanceTimersByTimeAsync(60)
    r.chunk() // 4-й кусок голоса — «both», он успел в распознаватель
    expect(r.log.slice(0, 7)).toEqual(['voice', 'voice', 'voice', 'voice', 'tracks stop', 'silence 6400', 'retrieve'])
    r.chunk(); expect(r.rec.acceptWaveform).toHaveBeenCalledTimes(5) // 4 голоса + тишина; поздний кусок не идёт
    await vi.advanceTimersByTimeAsync(30)
    expect(r.cb.onResult.mock.calls[0][0]).toContain('both')
    expect(r.cb.onResult.mock.calls[0][1]).toMatchObject({ stopBy: 'manual', tailMs: TAIL_SILENCE_MS })
    expect(r.cb.onResult.mock.calls[0][1].drainMs).toBeLessThan(DRAIN_MAX_MS)
  })

  it('тап, а куски звука не приходят (страницу заморозили): через DRAIN_MAX_MS всё равно просим итог; cancel во время ожидания итог не запрашивает', async () => {
    const r = rig()
    const h = await startListening(r.model, '[]', r.cb, {})
    h.stop()
    await vi.advanceTimersByTimeAsync(DRAIN_MAX_MS - 10); expect(r.rec.retrieveFinalResult).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20); expect(r.rec.retrieveFinalResult).toHaveBeenCalledTimes(1)
    const q = rig()
    const h2 = await startListening(q.model, '[]', q.cb, {})
    h2.stop(); h2.cancel()
    await vi.advanceTimersByTimeAsync(DRAIN_MAX_MS * 2)
    expect(q.rec.retrieveFinalResult).not.toHaveBeenCalled()
  })

  it('диагностика звука: самый долгий промежуток между кусками и число опоздавших кусков', async () => {
    const r = rig()
    await startListening(r.model, '[]', r.cb, {})
    r.chunk(); await vi.advanceTimersByTimeAsync(128); r.chunk(); await vi.advanceTimersByTimeAsync(400); r.chunk() // третий пришёл с опозданием 400 мс вместо 128
    r.handlers.result({ result: { text: 'x', result: [] } })
    const st = r.cb.onResult.mock.calls[0][1]
    expect(st).toMatchObject({ chunkMs: 128, lateChunks: 1 }); expect(st.maxGapMs).toBeGreaterThanOrEqual(400)
  })
})

describe('мягкий порог для последнего слова фразы', () => {
  it('«both» с уверенностью 0.2 в конце эталона принимается (раньше терялось порогом 0.3), посреди фразы — нет', () => {
    const words = [{ word: 'please', conf: 0.2 }, { word: 'both', conf: 0.2 }]
    expect(cleanResult({ words, tailWord: 'both' }).text).toBe('both')
    expect(cleanResult({ words }).text).toBe('') // без эталона — прежние 0.3
    expect(cleanResult({ words: [{ word: 'both', conf: 0.1 }], tailWord: 'both' }).text).toBe('') // совсем низкая — всё равно нет
  })
})
