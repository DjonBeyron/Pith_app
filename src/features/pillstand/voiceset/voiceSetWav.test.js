import { describe, it, expect } from 'vitest'
import { resample, encodeWav, decodeWav, joinChunks, SET_RATE } from './voiceSetWav.js'

// WAV-кодировщик и передискретизация «Записи набора»: уровни не меняются, зеркальных частот нет, формат читается обратно
const sine = (hz, rate, sec, amp = 0.5) => Float32Array.from({ length: Math.round(rate * sec) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate))
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)) }
const mid = x => rms(x, Math.round(x.length * 0.2), Math.round(x.length * 0.8)) // без краёв: у фильтра там разгон

describe('передискретизация в 16 кГц', () => {
  it('длина — по отношению частот; та же частота — тот же массив', () => {
    expect(resample(sine(440, 48000, 1), 48000)).toHaveLength(16000)
    expect(resample(sine(440, 44100, 1), 44100)).toHaveLength(16000)
    const x = sine(440, 16000, 0.1)
    expect(resample(x, 16000)).toBe(x)
    expect(resample(new Float32Array(0), 48000)).toHaveLength(0)
  })
  it('речевая полоса проходит без потери уровня (48 и 44,1 кГц): 200 Гц … 6 кГц — в пределах 1 %', () => {
    for (const rate of [48000, 44100]) for (const hz of [200, 1000, 3000, 6000]) {
      const y = resample(sine(hz, rate, 0.5), rate)
      expect(mid(y) / (0.5 / Math.SQRT2)).toBeGreaterThan(0.99)
      expect(mid(y) / (0.5 / Math.SQRT2)).toBeLessThan(1.01)
    }
  })
  it('выше половины новой частоты — подавлено (зеркала в полосе речи нет): 9, 12, 20 кГц тише −60 дБ', () => {
    for (const rate of [48000, 44100]) for (const hz of [9000, 12000, 20000]) expect(mid(resample(sine(hz, rate, 0.5), rate))).toBeLessThan(0.5 / Math.SQRT2 / 1000)
  })
  it('постоянный уровень и тишина не меняются; тон остаётся тем же тоном (1 кГц: период 16 отсчётов)', () => {
    const dc = resample(new Float32Array(4800).fill(0.25), 48000)
    expect(dc[800]).toBeCloseTo(0.25, 5)
    expect(Math.max(...resample(new Float32Array(4800), 48000).map(Math.abs))).toBe(0)
    const y = resample(sine(1000, 48000, 0.5), 48000)
    for (let i = 3000; i < 3040; i++) expect(y[i]).toBeCloseTo(y[i + 16], 3)
  })
  it('тихая речь iPhone (rms 0,004) сохраняет уровень: квантование 16 бит не съедает', () => {
    const x = sine(700, 48000, 0.5, 0.004 * Math.SQRT2), w = decodeWav(encodeWav(resample(x, 48000)).bytes)
    expect(mid(w.samples) / 0.004).toBeGreaterThan(0.98)
    expect(mid(w.samples) / 0.004).toBeLessThan(1.02)
  })
})

describe('WAV PCM 16 бит моно', () => {
  it('заголовок: RIFF/WAVE, PCM, 1 канал, 16 кГц, 16 бит, длина данных', () => {
    const { bytes, clipped } = encodeWav(sine(440, 16000, 1)), v = new DataView(bytes.buffer)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 16))).toBe('WAVEfmt ')
    expect(bytes).toHaveLength(44 + 32000)
    expect([v.getUint32(4, true), v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint32(28, true), v.getUint16(32, true), v.getUint16(34, true), v.getUint32(40, true)])
      .toEqual([36 + 32000, 1, 1, 16000, 32000, 2, 16, 32000])
    expect(clipped).toBe(0)
  })
  it('читается обратно с точностью до шага квантования; перегруз считается и обрезается', () => {
    const x = sine(440, 16000, 0.2, 0.7), w = decodeWav(encodeWav(x).bytes)
    expect(w).toMatchObject({ rate: SET_RATE, channels: 1, bits: 16 })
    expect(w.samples).toHaveLength(x.length)
    for (let i = 0; i < x.length; i += 97) expect(Math.abs(w.samples[i] - x[i])).toBeLessThan(1 / 16000)
    const loud = encodeWav(Float32Array.from([0, 1.5, -1.5, 0.5]))
    expect(loud.clipped).toBe(2)
    expect([...decodeWav(loud.bytes).samples].map(v => Math.round(v * 1000) / 1000)).toEqual([0, 1, -1, 0.5])
  })
  it('не WAV — ошибка; куски склеиваются по порядку', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/WAV/)
    expect([...joinChunks([Float32Array.from([1, 2]), Float32Array.from([3]), new Float32Array(0), Float32Array.from([4, 5])])]).toEqual([1, 2, 3, 4, 5])
  })
})
