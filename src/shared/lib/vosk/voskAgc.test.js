import { describe, it, expect } from 'vitest'
import { createAgc, applyGain, AGC_TARGET, AGC_SNR, AGC_MAX, AGC_LIMIT, AGC_RISE } from './voskAgc.js'

// Автоусиление перед Vosk (v3.3.185): модель чувствительна к абсолютной громкости — речь 0,0045 без усиления даёт 30 слов из 48, ×10 — 47
const CH = 43
describe('voskAgc: усиление звука для распознавателя', () => {
  it('тихий микрофон (шум 0,0003): потолок TARGET / (шум × SNR) ≈ ×27 — речь 0,0045 уходит в Vosk как 0,12', () => {
    const a = createAgc({ noise: () => 0.0003 })
    const k = a.next(0.0003, CH)
    expect(k.to).toBeCloseTo(AGC_TARGET / (0.0003 * AGC_SNR), 3)
    const w = a.next(0.0045, CH)
    expect(w).toEqual({ from: k.to, to: k.to }) // тихое слово: усиление внутри слова постоянно
    expect(0.0045 * w.to).toBeCloseTo(0.12, 2)
    expect(a.max).toBe(26.7)
  })
  it('обычный и шумный микрофон (шум ≥ 0,008) — ×1: ничего не меняется; шум не известен — тоже ×1; совсем тихий — не больше AGC_MAX', () => {
    expect(createAgc({ noise: () => 0.008 }).next(0.05, CH)).toEqual({ from: 1, to: 1 })
    expect(createAgc({ noise: () => 0 }).next(0.05, CH)).toEqual({ from: 1, to: 1 })
    expect(createAgc({ noise: () => 0.00005 }).next(0.0001, CH).to).toBe(AGC_MAX)
  })
  it('громкая речь на тихом микрофоне не перегружается: кусок после усиления не громче AGC_LIMIT, усиление падает сразу, а растёт обратно медленно', () => {
    const a = createAgc({ noise: () => 0.0009 }) // потолок ≈ ×8,9
    const quiet = a.next(0.0009, CH)
    expect(quiet.to).toBeCloseTo(8.9, 1)
    const loud = a.next(0.18, CH)
    expect(0.18 * loud.to).toBeCloseTo(AGC_LIMIT, 5)
    expect(loud.from).toBe(loud.to) // падает с НАЧАЛА громкого куска: его первые миллисекунды не уходят в Vosk с усилением ×8,9 (щелчок на начале слова)
    const next = a.next(0.05, CH) // тихий согласный следом: усиление почти то же (огибающая слова не сплющивается)
    expect(next.to / loud.to).toBeCloseTo(AGC_RISE ** (CH / 1000), 5)
    let g = next.to
    for (let i = 0; i < 100; i++) g = a.next(0.0009, CH).to // 4,3 с тишины — вернулось к потолку
    expect(g).toBeCloseTo(AGC_TARGET / (0.0009 * AGC_SNR), 3)
    expect(a.next(0.9, CH).to).toBe(1) // и никогда не ослабляет
  })
  it('затвор закрыт (idle) — усиление сразу у потолка: громкий звук перед тихой речью (щелчок микрофона, хлопок из динамика, громкое слово) не оставляет её без усиления', () => {
    const a = createAgc({ noise: () => 0.0003 })
    a.next(0.0003, CH)
    expect(a.next(0.2, CH).to).toBeCloseTo(1.25, 5) // хлопок: усиление упало
    const tail = a.next(0.0003, CH)
    expect(tail.to).toBeLessThan(1.4) // хвост после хлопка ещё идёт в Vosk — усиление растёт медленно (огибающая цела)
    const idle = a.next(0.0003, CH, true) // затвор закрылся: звук в Vosk не идёт
    expect(idle.from).toBeCloseTo(tail.to, 5); expect(idle.to).toBeCloseTo(26.67, 1) // плавно по куску — до потолка (без idle на это ушло бы 4 с)
    expect(a.next(0.004, CH)).toEqual({ from: idle.to, to: idle.to }) // тихое слово следом — с полным усилением
    expect(a.next(0.2, CH, true).to).toBeCloseTo(1.25, 5) // ограничитель действует и при закрытом затворе: кусок может уйти в Vosk предзвуком
  })
  it('applyGain: копия куска с плавным переходом усиления (без щелчка на границе), исходный кусок не меняется', () => {
    const src = new Float32Array([0.1, 0.1, 0.1, 0.1]), out = applyGain(src, 2, 4)
    expect([...out].map(v => +v.toFixed(3))).toEqual([0.25, 0.3, 0.35, 0.4])
    expect([...src]).toEqual([...new Float32Array([0.1, 0.1, 0.1, 0.1])])
    expect([...applyGain(src, 3, 3)].map(v => +v.toFixed(3))).toEqual([0.3, 0.3, 0.3, 0.3])
  })
})
