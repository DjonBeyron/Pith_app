import { describe, it, expect } from 'vitest'
import { createVoiceLevel, levelGain, LEVEL_NOISE, LEVEL_PEAK, LEVEL_GAIN_MAX } from './wordLaneVoiceLevel.js'
import { sensitiveLevel, GAME_LEVEL_DECAY_MS } from './wordLaneConfig.js'
import { createVoiceGate } from './wordLaneVoiceGate.js'
import { breathStep, PRE_CONFIRM_CAP, FILL_CAP } from './wordLaneTimeline.js'
import { createEarVoice } from '../../../../shared/lib/vosk/voskVoice.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'

const CH = 43 // мс на кусок звука
// Микрофон: счётчик голоса слушателя + уровень игры + ворота голоса + «дыхание» пилюли, как в кадре игры (useWordLanePills / standWordRun). feed(rms[]) → заливка и уровни по кускам
function mic({ fromRms = createVoiceLevel(), confirmed = false } = {}) {
  let t = 0, p = 0
  const voice = createEarVoice({ now: () => t }), level = createRmsLevel({ now: () => t, fromRms }), gate = createVoiceGate()
  const out = { fromRms, voice, raw: [], gated: [], fill: [] }
  out.feed = list => {
    for (const rms of list) {
      voice.push(rms); level.push(rms, t, voice)
      out.raw.push(level.read(t))
      for (let k = 0; k < 3; k++) { // три кадра на кусок
        const g = gate.step(level.read(t), t, CH / 3).level
        p = breathStep(p, CH / 3000, g, confirmed ? FILL_CAP : PRE_CONFIRM_CAP)
        t += CH / 3
        if (k === 2) { out.gated.push(g); out.fill.push(p) }
      }
    }
    return out
  }
  return out
}
const rep = (v, n) => Array.from({ length: n }, () => v)
const NOISE = [0.0003, 0.00034, 0.00028, 0.00031, 0.00036, 0.00029] // фон тихого микрофона iPhone
const quiet = n => Array.from({ length: n }, (_, i) => NOISE[i % NOISE.length])
const WORD = [0.0022, 0.0038, 0.0045, 0.0041, 0.0033, 0.0044, 0.003, 0.0016] // «house» владельца: пик 0,0045

describe('уровень голоса для анимации — от шума микрофона (v3.3.187)', () => {
  it('усиление: шум 0,0003 → ×10; шум ≥ 0,003 — нет; пик высказывания не поднимается выше 0,05; потолок ×20; шума не знаем — нет', () => {
    expect(levelGain(0.0003, 0.004)).toBeCloseTo(10, 5)
    expect(levelGain(LEVEL_NOISE, 0.004)).toBe(1)
    expect(levelGain(0.006, 0.02)).toBe(1)
    expect(levelGain(0.0003, 0.02)).toBeCloseTo(LEVEL_PEAK / 0.02, 5) // ×2,5, а не ×10
    expect(levelGain(0.0003, 0.05)).toBe(1)
    expect(levelGain(0.0003, 0.2)).toBe(1)
    expect(levelGain(0.00005, 0.001)).toBe(LEVEL_GAIN_MAX)
    expect(levelGain(0, 0.004)).toBe(1)
  })
  it('тихий микрофон (речь 0,003–0,005 при фоне 0,0003): уровень как у обычной речи раньше, заливка идёт с первых кусков; прежняя кривая давала ровно 0', () => {
    const m = mic().feed(quiet(40)).feed(WORD)
    const lv = m.raw.slice(40)
    expect(lv[0]).toBeGreaterThan(0.3)                 // первый кусок голоса 0,0022 — уже заметно
    expect(Math.max(...lv)).toBeGreaterThan(0.6)       // пик 0,0045 — как обычная речь 0,03–0,05 раньше (0,61–0,75)
    expect(Math.max(...lv)).toBeLessThanOrEqual(sensitiveLevel(LEVEL_PEAK) + 1e-9) // и не выше «обычной»: кольца не упираются в 1,0
    expect(m.fromRms.info()).toMatchObject({ voice: true }) // последний кусок — хвост слова, ещё голос
    expect(m.fill[40 + 4]).toBeGreaterThan(0.3)        // 200 мс голоса: заливка у потолка «до подтверждения речи» (0,4)
    expect(m.fill[40 + 4]).toBeLessThanOrEqual(PRE_CONFIRM_CAP)
    const old = mic({ fromRms: sensitiveLevel }).feed(quiet(40)).feed(WORD)
    expect(Math.max(...old.raw)).toBe(0)               // до v3.3.187
    expect(Math.max(...old.fill)).toBe(0)
  })
  it('тихий микрофон заливается так же, как обычный: заливка через 200 мс голоса не ниже, чем у речи 0,05 на обычном микрофоне по прежней кривой', () => {
    const q = mic({ confirmed: true }).feed(quiet(40)).feed(WORD)
    const n = mic({ fromRms: sensitiveLevel, confirmed: true }).feed(rep(0.004, 40)).feed(WORD.map(v => v * 11))
    expect(q.fill[44]).toBeGreaterThan(n.fill[44] * 0.9)
    expect(n.fill[44]).toBeGreaterThan(0.5)
  })
  it('тишина и шум комнаты не наливают и не зажигают кольца: фон тихого микрофона, его колебания ×2, шорох ниже порога голоса', () => {
    const m = mic().feed(quiet(120)).feed([0.0006, 0.0003, 0.0007, 0.0003, 0.0015, 0.0003, 0.0018, 0.0003]).feed(quiet(60))
    expect(Math.max(...m.raw)).toBe(0)
    expect(Math.max(...m.gated)).toBe(0)
    expect(Math.max(...m.fill)).toBe(0)
  })
  it('шумная комната (фон 0,004 и 0,008): усиления нет — уровень точно прежний, ворота держат пол шума', () => {
    for (const bg of [0.004, 0.008]) {
      const m = mic().feed(rep(bg, 120)), old = mic({ fromRms: sensitiveLevel }).feed(rep(bg, 120))
      expect(m.raw).toEqual(old.raw)
      expect(Math.max(...m.fill)).toBe(0)
    }
  })
  it('обычный микрофон — как раньше: шум ≥ 0,003 — уровень любого куска равен прежнему; на любом шуме кусок 0,05 и громче равен прежнему', () => {
    const speech = [0.012, 0.02, 0.03, 0.05, 0.08, 0.12, 0.06, 0.03, 0.02, 0.009]
    for (const bg of [0.003, 0.004, 0.006]) {
      const m = mic().feed(rep(bg, 60)).feed(speech), old = mic({ fromRms: sensitiveLevel }).feed(rep(bg, 60)).feed(speech)
      expect(m.raw).toEqual(old.raw)
      expect(m.fill).toEqual(old.fill)
    }
    const f = createVoiceLevel(), t = { v: 0 }, voice = createEarVoice({ now: () => t.v })
    for (const rms of [...rep(0.0005, 40), 0.01, 0.03, 0.05, 0.08, 0.2, 0.11]) { t.v += CH; voice.push(rms); const lv = f(rms, voice); if (rms >= LEVEL_PEAK) expect(lv).toBe(sensitiveLevel(rms)) }
    expect(f.info()).toMatchObject({ gain: 1, voice: true })
  })
  it('тихая речь 0,012–0,026 на чистом микрофоне (фон 0,0003): пик поднят до «обычной речи» (0,75), не до 1,0 — динамика остаётся', () => {
    const m = mic().feed(quiet(40)).feed([0.008, 0.016, 0.026, 0.02, 0.012, 0.022, 0.006])
    const lv = m.raw.slice(40)
    expect(Math.max(...lv)).toBeCloseTo(sensitiveLevel(LEVEL_PEAK), 2)
    expect(Math.min(...lv.slice(0, 6))).toBeGreaterThan(0.4)
    expect(lv[2] - lv[4]).toBeGreaterThan(0.1) // громкий и тихий слог различимы
  })
  it('без счётчика голоса (уровень толкают без voice) — прежняя кривая; спад как у игры', () => {
    const f = createVoiceLevel()
    for (const rms of [0, 0.004, 0.006, 0.02, 0.05, 0.3]) expect(f(rms)).toBe(sensitiveLevel(rms))
    expect(f.decayMs).toBe(GAME_LEVEL_DECAY_MS)
    expect(f.info()).toMatchObject({ gain: 1, voice: false, noise: 0 })
  })
})
