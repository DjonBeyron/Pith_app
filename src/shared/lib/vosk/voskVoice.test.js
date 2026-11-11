import { describe, it, expect } from 'vitest'
import { createEarVoice, voiceNote, ON_MIN, OFF_MIN, OFF_PEAK, ON_NOISE, EAR_GAP_MS } from './voskVoice.js'

// Порог голоса от шума микрофона и пика речи (v3.3.183): тихий микрофон iPhone (речь 0,012–0,026, фон 0,0002) должен работать как громкий.
const CHUNK = 46
function rig() {
  let t = 0
  const v = createEarVoice({ now: () => t })
  const push = (rms, ms = CHUNK) => { let last; for (let k = 0; k < ms; k += CHUNK) { last = v.push(rms); t += CHUNK } return last }
  return { v, push, wait: ms => { t += ms } }
}

describe('голос по уровню: порог от шума и пика', () => {
  it('тихий микрофон: фон 0,0002 — не голос; речь 0,013 — голос (жёсткий порог 0,015 её пропускал); тихий согласный 0,002 внутри слова — тоже голос', () => {
    const r = rig()
    expect(r.push(0.0002, 400).voice).toBe(false)
    expect(r.push(0.013)).toMatchObject({ voice: true, started: true })
    r.push(0.024, 200)
    expect(r.push(0.002).voice).toBe(true)   // 8 % пика: «s», «f», взрыв «k»
    expect(r.push(0.0006).voice).toBe(false) // ниже 5 % пика и ниже OFF_MIN — пауза
    expect(r.v.state()).toMatchObject({ noise: 0.0002, peak: 0.024, off: Math.round(0.024 * OFF_PEAK * 1e4) / 1e4 })
    expect(voiceNote(r.v.state())).toBe('порог голоса 0.0012 (шум 0.0002, пик речи 0.024)')
  })
  it('гистерезис: начать голос — громче ON_MIN, продолжить — достаточно OFF_MIN / доли пика; шорох тише ON_MIN голос не начинает', () => {
    const r = rig()
    r.push(0.0002, 300)
    expect(r.push(ON_MIN * 0.8).voice).toBe(false)
    expect(r.push(0.006).voice).toBe(true)
    expect(r.push(Math.max(OFF_MIN, 0.006 * OFF_PEAK) * 1.2).voice).toBe(true)
  })
  it('шумный микрофон: порог — шум × ON_NOISE; оценка шума быстро падает и медленно растёт', () => {
    const r = rig()
    r.push(0.004, 500)
    expect(r.v.state().on).toBeCloseTo(0.004 * ON_NOISE, 4)
    expect(r.push(0.012).voice).toBe(false) // 3 × шум — ещё не голос
    expect(r.push(0.05).voice).toBe(true)
    r.push(0.05, 1000)
    expect(r.v.state().noise).toBeLessThan(0.0048) // секунда речи шум почти не подняла
    r.push(0.001, 300)
    expect(r.v.state().noise).toBeLessThan(0.0012) // стало тише — оценка упала за несколько кусков
  })
  it('длительность голоса и тишина; пауза внутри высказывания возвращается как gap, новое высказывание — после EAR_GAP_MS', () => {
    const r = rig()
    expect(r.v.quietMs()).toBe(null)
    r.push(0.0002, 300); r.push(0.02, 230)
    expect(r.v.ms()).toBe(4 * CHUNK)
    r.push(0.0002, 138)
    expect(r.v.quietMs()).toBe(4 * CHUNK)
    expect(r.push(0.02)).toMatchObject({ voice: true, started: false, gap: 4 * CHUNK, low: 0.0002 })
    r.push(0.0002, EAR_GAP_MS + CHUNK)
    expect(r.push(0.02)).toMatchObject({ started: true, gap: 0 })
    expect(r.v.ms()).toBe(0)
  })
  it('начало высказывания — задним числом: тихое нарастание перед «голос начался» (куски подряд громче порога продолжения) входит в длину голоса', () => {
    const r = rig()
    r.push(0.0003, 400)
    r.push(0.001); r.push(0.0015); r.push(0.0018) // «b…»: тише порога начала 0,002, громче порога продолжения 0,0008
    expect(r.push(0.004)).toMatchObject({ voice: true, started: true })
    r.push(0.004); r.push(0.002)
    expect(r.v.ms()).toBe(5 * CHUNK) // раньше — 2 куска (92 мс): правило слова отвергало «book» как слишком короткое
    r.push(0.0003, EAR_GAP_MS + CHUNK)
    r.push(0.0003); expect(r.push(0.004).started).toBe(true)
    expect(r.v.ms()).toBe(0) // перед этим словом нарастания не было — отсчёт от него самого
  })
  it('ровный ноль (игра выключила дорожку) — не голос и не шум', () => {
    const r = rig()
    r.push(0.002, 300); r.push(0, 500)
    expect(r.v.state().noise).toBe(0.002)
    expect(r.push(0).voice).toBe(false)
  })
  it('громкий щелчок (нота из динамика, удар по телефону) не оглушает: пик — только текущего высказывания, тихая речь после него слышна', () => {
    const r = rig()
    r.push(0.0002, 300); r.push(0.5, 92); r.push(0.0002, EAR_GAP_MS + 2 * CHUNK)
    expect(r.push(0.013)).toMatchObject({ voice: true, started: true })
    expect(r.push(0.002).voice).toBe(true) // порог продолжения — от пика ЭТОГО слова (0,013), а не щелчка
    expect(r.v.state().peak).toBe(0.013)
  })
})
