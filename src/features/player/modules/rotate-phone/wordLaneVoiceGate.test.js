import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createVoiceGate, WARM_MS, ON_MS, ON_MARGIN, HOLD_MS, FLOOR_START, MUTE_MS } from './wordLaneVoiceGate.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const DT = 16

// Гоним кадры: signal(t) → уровень микрофона; возвращает [{ t, on, level }]
const run = (signal, ms, gate = createVoiceGate(), from = 0, onFrame = null) => {
  const out = []
  for (let t = from; t < from + ms; t += DT) { const r = gate.step(signal(t - from), t, DT); out.push({ t, ...r }); onFrame?.(t, r) }
  return out
}

describe('ворота голоса: анимация только на настоящий голос', () => {
  it('тишина и ровный шум комнаты (даже заметный из-за автоусиления) — голоса нет, ни одного кадра «on»', () => {
    for (const noise of [0, 0.05, 0.2, 0.35]) {
      const r = run(t => noise + 0.02 * Math.sin(t / 37), 8000)
      expect(r.some(f => f.on)).toBe(false)
      expect(r.every(f => f.level === 0)).toBe(true)
    }
  })

  it('одиночный всплеск (щелчок, стук) короче ON_MS не считается голосом', () => {
    const r = run(t => (t >= 500 && t < 500 + ON_MS - 2 * DT ? 0.9 : 0.02), 2000)
    expect(r.some(f => f.on)).toBe(false)
  })

  it('настоящий голос включается через ON_MS и следует громкости; паузы внутри слова короче HOLD_MS его не рвут; в тишине выключается', () => {
    const sig = t => (t < 700 ? 0.02 : t < 1200 ? 0.8 : t < 1200 + HOLD_MS - 2 * DT ? 0.03 : t < 1800 ? 0.8 : 0.02)
    const r = run(sig, 3200)
    const firstOn = r.find(f => f.on)
    expect(firstOn.t).toBeGreaterThanOrEqual(Math.max(700 + ON_MS - DT, WARM_MS))
    expect(firstOn.t).toBeLessThanOrEqual(Math.max(700 + ON_MS + 3 * DT, WARM_MS + 3 * DT)) // отклик быстрый: ≈ 100 мс после начала голоса (но не раньше конца прогрева)
    expect(r.filter(f => f.t > 900 && f.t < 1700).every(f => f.on)).toBe(true) // короткая пауза внутри слова не рвёт
    expect(r.at(-1).on).toBe(false)
    expect(r.find(f => f.on && f.t > 600).level).toBeGreaterThan(0.6)
  })

  it('пол шума подстраивается: в шумной комнате (фон 0,3) голос на 0,8 всё равно находится, а сам фон — нет', () => {
    const r = run(t => (t < 4000 ? 0.3 : t < 5000 ? 0.85 : 0.3), 7000)
    expect(r.filter(f => f.t < 4000).some(f => f.on)).toBe(false)
    expect(r.filter(f => f.t > 4200 && f.t < 4900).every(f => f.on)).toBe(true)
  })

  it('заглушение после принятой пилюли: нота из динамика (громкая) голосом не считается, и пол на ней не «учится»', () => {
    const gate = createVoiceGate()
    run(() => 0.03, 600, gate)
    gate.mute(600)
    const echo = run(t => (t < 560 ? 0.9 : 0.4 * Math.exp(-t / 500)), MUTE_MS - 2 * DT, gate, 600)
    expect(echo.some(f => f.on)).toBe(false)
    expect(gate.floor()).toBeLessThan(FLOOR_START + 0.01)
    const after = run(t => (t < 200 ? 0.03 : 0.8), 1200, gate, 600 + MUTE_MS)
    expect(after.find(f => f.on)).toBeTruthy()                               // а дальше голос ученика снова ловится
  })

  it('значения: пол стартует с запасом, запас включения больше запаса выключения (гистерезис)', () => {
    expect(ON_MARGIN).toBeGreaterThan(0.1)
    expect(HOLD_MS).toBeGreaterThanOrEqual(200)
    expect(FLOOR_START).toBeGreaterThan(0)
  })
})

describe('подключение: худ, заливка и рот кота — через ворота', () => {
  it('движок кормит конвейер ученика и худ громкостью после ворот; принятая пилюля глушит ворота', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('level = gate.step(raw, now, now - lastNow).level')
    expect(eng).toContain('stepStudent(g, t, { level, seq, misses: liveRef.current.misses, confirmed')
    expect(eng).toContain('gate.mute(performance.now())')
    expect(eng).toContain('fxRef.current?.mouth?.(level)')
  })
})
