import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRecognizer } from './voskRecognizer.js'
import { startListening } from './voskEngine.js'
import { readSayData } from '../speech/sayPhraseData.js'

// Медленная речь через настоящие createVoskRecognizer + startListening + затвор тишины. Подставной ДЕКОДЕР повторяет эндпойнтер Vosk: «сам закончил» (result), когда он увидел
// тишину после слов: ≥ 2,0 с (rule4) всегда, ≥ 0,5 с (rule2), если фраза уже вся. Настоящую модель в тестах не запустить — правила взяты из model.conf / вшитых в vosk-browser значений.
const DATA = readSayData({ phrase: "I'm trying to please both", keywords: 'trying' })
const WORDS = ["i'm", 'trying', 'to', 'please', 'both']
const CHUNK = 128
const VOICE = new Float32Array(8).fill(0.4)
const SILENT = new Float32Array(8)
const NOISE = new Float32Array(8).fill(0.02) // комната шумит: выше порога затвора, но декодер считает это тишиной

function rig() {
  const handlers = {}
  const sim = { rule2: true, n: 0, silence: 0, heard: false, fed: 0, silenceFed: 0, ended: false }
  const wordRows = () => WORDS.slice(0, sim.n).map((word, i) => ({ word, conf: 0.9, start: i, end: i + 0.4 }))
  const text = () => WORDS.slice(0, sim.n).join(' ')
  const feed = d => {
    const quiet = Math.max(...d.map(Math.abs)) < 0.05
    sim.fed += CHUNK
    if (quiet) { sim.silence += CHUNK; sim.silenceFed += CHUNK } else { sim.silence = 0; sim.heard = true }
    const complete = sim.n === WORDS.length
    if (sim.heard && !sim.ended && (sim.silence >= 2000 || (sim.rule2 && complete && sim.silence >= 500))) { sim.ended = true; handlers.result({ result: { text: text(), result: wordRows() } }) }
  }
  const rec = {
    on: (n, f) => { handlers[n] = f }, setWords: vi.fn(), remove: vi.fn(),
    acceptWaveform: vi.fn(b => feed(b.getChannelData(0))), acceptWaveformFloat: vi.fn((d, rate) => { sim.fed += (d.length / rate) * 1000; sim.silenceFed += 0 }),
    retrieveFinalResult: vi.fn(() => setTimeout(() => handlers.result({ result: { text: text(), result: wordRows() } }), 20)),
  }
  const track = { stop: vi.fn() }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  class Ctx { constructor() { this.sampleRate = 16000; this.destination = {}; this.close = vi.fn(async () => {}) } createScriptProcessor() { return proc } createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } } }
  vi.stubGlobal('window', { AudioContext: Ctx })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } })
  const views = []
  const r = createVoskRecognizer({ runtime: { getModel: () => ({ KaldiRecognizer: function () { return rec } }) }, listen: startListening, onView: v => views.push(v) })
  const tick = async (data = SILENT) => { await vi.advanceTimersByTimeAsync(CHUNK); proc.onaudioprocess({ inputBuffer: { duration: CHUNK / 1000, getChannelData: () => data } }) }
  const pause = async (ms, data = SILENT) => { for (let t = 0; t < ms; t += CHUNK) await tick(data) }
  const say = async () => { // слово: 3 куска голоса, затем partial со всеми сказанными словами
    for (let i = 0; i < 3; i++) await tick(VOICE)
    sim.n++
    handlers.partialresult({ result: { partial: text() } })
  }
  const start = async () => { r.start({ reference: DATA.phrase, lang: 'en-US', data: DATA }); await vi.advanceTimersByTimeAsync(50) }
  return { r, rec, handlers, sim, views, say, pause, tick, start, last: () => views.at(-1), track }
}

describe('медленная речь («i\'m … trying … to … please … both» с паузами) не обрывается', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('причина обрыва: без затвора декодер сам заканчивает на паузе 2 с посреди фразы (stopBy=endpoint, слов 2 из 5) — так и обрывалась медленная речь', async () => {
    const h = rig()
    const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn() }
    await startListening({ KaldiRecognizer: function () { return h.rec } }, '[]', cb, { autoStopMs: 0 }) // авто-стоп выключен, затвора нет: решает один эндпойнтер Vosk
    for (let i = 0; i < 3; i++) await h.tick(VOICE)
    h.sim.n = 2; h.handlers.partialresult({ result: { partial: "i'm trying" } })
    await h.pause(1800); expect(cb.onResult).not.toHaveBeenCalled()
    await h.pause(400)
    expect(cb.onResult).toHaveBeenCalledTimes(1)
    expect(cb.onResult.mock.calls[0][0]).toBe("i'm trying")
    expect(cb.onResult.mock.calls[0][1].stopBy).toBe('endpoint')
  })

  it('паузы 1,5 / 2,0 / 2,3 с между словами: запись идёт, декодеру тишины отдано мало, итог — только после последнего слова и быстро', async () => {
    const h = rig()
    await h.start()
    for (const gap of [1500, 2000, 2200, 2000]) { await h.say(); await h.pause(gap); expect(h.last().status).toBe('listening') }
    expect(h.sim.ended).toBe(false)
    expect(h.sim.silenceFed).toBeLessThan(5 * 500) // каждая пауза урезана до ≈0,4 с (было бы 8 с)
    await h.say() // «both» — фраза вся: затвор открыт, декодер сам заканчивает через 0,5 с (rule2) — быстро, как раньше
    const t0 = Date.now()
    for (let i = 0; i < 20 && h.last().status === 'listening'; i++) await h.tick()
    expect(h.last()).toMatchObject({ status: 'done', final: { text: "i'm trying to please both" } })
    expect(Date.now() - t0).toBeLessThanOrEqual(700)
    expect(h.last().raw.stopBy).toBe('endpoint')
    expect(h.last().raw.gatedMs).toBeGreaterThan(4000) // сколько тишины в паузах не отдали движку
  })

  it('вся фраза, а декодер сам не заканчивает (шум, rule2 не сработал): наш быстрый стоп за 0,8 с, причина «full» — не 2,5 с', async () => {
    const h = rig()
    h.sim.rule2 = false
    await h.start()
    for (const gap of [1500, 2000, 2200, 2000]) { await h.say(); await h.pause(gap) }
    await h.say()
    const t0 = Date.now()
    for (let i = 0; i < 30 && h.last().status === 'listening'; i++) await h.tick()
    expect(h.last()).toMatchObject({ status: 'done', final: { text: "i'm trying to please both" } })
    expect(Date.now() - t0).toBeLessThanOrEqual(1200) // AUTOSTOP_FULL 0,8 с + тик 100 мс + итог, а не 2,5 с
    expect(h.last().raw.stopBy).toBe('full')
  })

  it('фраза неполная («i\'m trying …» и молчание): остановка только после 2,5 с тишины, не раньше; причина — авто-стоп', async () => {
    const h = rig()
    await h.start()
    await h.say(); await h.say()
    await h.pause(2300); expect(h.last().status).toBe('listening')
    await h.pause(600)
    expect(h.last()).toMatchObject({ status: 'done', final: { text: "i'm trying" } })
    expect(h.last().raw.stopBy).toBe('auto')
  })

  it('ручной стоп посреди паузы: итог по сказанному, stopBy=manual, хвост тишины досылается как раньше', async () => {
    const h = rig()
    await h.start()
    await h.say(); await h.pause(1000); await h.say(); await h.pause(500)
    h.r.stop()
    await h.pause(CHUNK * 3)
    await vi.advanceTimersByTimeAsync(100)
    expect(h.last()).toMatchObject({ status: 'done', final: { text: "i'm trying" } })
    expect(h.last().raw).toMatchObject({ stopBy: 'manual', tailMs: 400 })
    expect(h.rec.acceptWaveformFloat).toHaveBeenCalled() // хвост TAIL_SILENCE_MS
  })

  it('слова не было совсем: тишина SAY_SILENCE_MS (8 с) заканчивает попытку «не слышу», декодеру отдано <0,5 с тишины', async () => {
    const h = rig()
    await h.start()
    await h.pause(7800); expect(h.last().status).toBe('listening')
    await h.pause(600)
    await vi.advanceTimersByTimeAsync(200)
    expect(h.last()).toMatchObject({ status: 'error', error: 'no-speech' })
    expect(h.sim.silenceFed).toBeLessThan(500)
  })

  it('шумная комната (шум выше порога затвора): затвор не режет, поведение как раньше — страховка не ломает запись', async () => {
    const h = rig()
    await h.start()
    await h.say(); await h.pause(1000, NOISE)
    expect(h.sim.silenceFed).toBeGreaterThanOrEqual(1000) // всё отдано
    expect(h.last().status).toBe('listening')
  })
})
