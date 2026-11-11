import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startListening } from './voskEngine.js'
import { createEarVoice } from './voskVoice.js'
import { GATE_RMS, GATE_PREROLL_MS } from './voskGate.js'

// Тихий микрофон iPhone через настоящий startListening + затвор + автоусиление (v3.3.186; отчёт владельца: «nice» — 20 попыток, 0 зачётов, речь rms 0,003–0,005 при фоне 0,0003, затвор с порогом 0,006
// не пускал её в Vosk). Подставной распознаватель записывает, какой звук до него дошёл.
const CH = 43 // кусок слушателя слов, мс
const amp = v => new Float32Array(8).fill(v)

function rig(opts) {
  const handlers = {}, fed = [], levels = []
  const rec = {
    on: (n, f) => { handlers[n] = f }, setWords: vi.fn(), remove: vi.fn(),
    acceptWaveform: vi.fn(b => fed.push(Math.abs(b.getChannelData(0)[7]))), acceptWaveformFloat: vi.fn(d => { if (d.length === 8) fed.push(Math.abs(d[7])) }), // хвост тишины перед итогом (другая длина) не считаем
    retrieveFinalResult: vi.fn(() => handlers.result({ result: { text: 'nice', result: [{ word: 'nice', conf: 1, start: 0.3, end: 0.8 }] } })),
  }
  const proc = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }
  class Ctx { constructor() { this.sampleRate = 48000; this.destination = {}; this.close = vi.fn(async () => {}) } createScriptProcessor() { return proc } createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } } }
  vi.stubGlobal('window', { AudioContext: Ctx })
  const cb = { onPartial: vi.fn(), onResult: vi.fn(), onError: vi.fn(), onLevel: rms => { levels.push(rms); opts.voice?.push(rms) } }
  const push = list => { for (const v of list) { vi.advanceTimersByTime(CH); proc.onaudioprocess({ inputBuffer: { duration: CH / 1000, getChannelData: () => amp(v) } }) } }
  const start = () => startListening({ KaldiRecognizer: function () { return rec } }, '["nice","[unk]"]', cb, { autoStopMs: 0, stream: { getTracks: () => [] }, gate: opts.voice ?? true })
  return { fed, levels, cb, push, start }
}

describe('тихий микрофон: затвор пускает тихую речь в Vosk, начало слова не теряется, звук усилен', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  for (const [name, mk] of [['затвор со своим счётчиком голоса («Сказать фразу»)', () => ({})], ['счётчик голоса слушателя слов — тот же, что у правила слова', () => ({ voice: createEarVoice({ now: () => Date.now() }) })]]) {
    it(`${name}: речь 0,003–0,005 при фоне 0,0003 дошла вся, с предзвуком и усилением ≈ ×27; долгая тишина — нет`, async () => {
      const h = rig(mk())
      const l = await h.start()
      h.push(Array(40).fill(0.0003)) // 1,7 с фона: затвор закрылся
      const before = h.fed.length
      expect(before * CH).toBeLessThan(400) // отдан только хвост GATE_KEEP_MS
      h.push([0.001, 0.0015, 0.0018]) // «n…» — нарастание тише порога начала голоса
      expect(h.fed.length).toBe(before)
      h.push([0.004, 0.005, 0.0035, 0.0012]) // «…ice»: пик 0,005 меньше прежнего порога затвора
      expect(Math.max(...h.levels)).toBeLessThan(GATE_RMS)
      const word = h.fed.slice(before)
      expect(word).toHaveLength(Math.min(Math.floor(GATE_PREROLL_MS / CH), 37) + 4) // предзвук (всё нарастание и фон перед ним) + 4 куска слова
      expect(word.at(-3)).toBeGreaterThan(0.1); expect(word.at(-3)).toBeLessThan(0.14) // в Vosk слово ушло усиленным: пик 0,005 → ≈ 0,12 (усиление ×23…27: оценка шума чуть подросла на нарастании)
      expect(word.at(-5)).toBeGreaterThan(word.at(-6) * 1.1); expect(word.at(-4)).toBeGreaterThan(word.at(-5) * 1.8) // нарастание перед словом — по порядку и в том же усилении (0,0015 → 0,0018 → 0,004)
      expect(h.levels.at(-3)).toBeCloseTo(0.005, 6) // а уровень для правила слова и колец — без усиления
      h.push(Array(6).fill(0.0003))
      l.stop('ear')
      const stats = h.cb.onResult.mock.calls[0][1]
      expect(stats).toMatchObject({ gatedVoiceMs: 0, stopBy: 'ear' })
      expect(stats.voiceMs).toBe(4 * CH)
      expect(stats.gatedMs).toBeGreaterThan(1000) // тишина до слова по-прежнему не идёт в распознаватель
      expect(stats.agcMax).toBeCloseTo(26.7, 1)
    })
  }

  it('громкий звук в начале захода (щелчок микрофона 0,05), потом тишина и тихое слово: затвор закрылся — усиление вернулось к потолку, слово ушло в Vosk как ≈ 0,1', async () => {
    const h = rig({})
    const l = await h.start()
    h.push([0.05, 0.05]); h.push(Array(20).fill(0.0003)) // щелчок: шум сначала оценён высоко, усиление ×1…2; за 0,9 с тишины затвор закрылся
    const before = h.fed.length
    h.push([0.004, 0.005, 0.0035])
    expect(Math.max(...h.fed.slice(before))).toBeGreaterThan(0.1) // без возврата к потолку усиление росло бы ×2 в секунду: слово ушло бы как ≈ 0,02
    l.stop('ear')
    expect(h.cb.onResult.mock.calls[0][1].agcMax).toBeGreaterThan(20)
  })
  it('обычный микрофон (фон 0,008, речь 0,1): усиления нет, звук идёт в распознаватель как есть', async () => {
    const h = rig({})
    const l = await h.start()
    h.push(Array(20).fill(0.008)); h.push([0.1, 0.12, 0.1]); h.push(Array(6).fill(0.008))
    l.stop('ear')
    expect(Math.max(...h.fed)).toBeCloseTo(0.12, 5)
    expect(h.cb.onResult.mock.calls[0][1]).toMatchObject({ agcMax: 1, gatedVoiceMs: 0, gatedMs: 0 }) // фон выше GATE_RMS: затвор не режет, как раньше
  })
})
