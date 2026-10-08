import { describe, it, expect, beforeEach } from 'vitest'
import {
  fft, computeBands, computeBandsAsync, normalizeBands, spectrumBandsAt, frameCount,
  requestSpectrum, peekSpectrum, _spectrumTestHooks, BAND_COUNT, SPECTRUM_FPS,
} from './audioSpectrum.js'

const RATE = 22050
const tone = (hz, sec, amp = 0.5) => Float32Array.from({ length: Math.round(RATE * sec) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / RATE))
const hooks = _spectrumTestHooks()
beforeEach(() => hooks.reset())

describe('fft: radix-2', () => {
  it('чистый синус даёт пик в своём бине, остальное — тишина', () => {
    const n = 1024, k = 37
    const re = Float32Array.from({ length: n }, (_, i) => Math.cos(2 * Math.PI * k * i / n))
    const im = new Float32Array(n)
    fft(re, im)
    const mag = i => Math.hypot(re[i], im[i])
    expect(mag(k)).toBeCloseTo(n / 2, 2)
    expect(mag(n - k)).toBeCloseTo(n / 2, 2)
    for (let i = 0; i < n / 2; i++) if (i !== k) expect(mag(i)).toBeLessThan(1e-3)
  })

  it('постоянный сигнал — только нулевой бин', () => {
    const re = new Float32Array(8).fill(1), im = new Float32Array(8)
    fft(re, im)
    expect(re[0]).toBeCloseTo(8, 5)
    for (let i = 1; i < 8; i++) expect(Math.hypot(re[i], im[i])).toBeLessThan(1e-5)
  })
})

describe('computeBands: полосы по кадрам', () => {
  it('440 Гц → полоса 1 (250–900), остальные тёмные; кадров — по SPECTRUM_FPS', () => {
    const spec = computeBands(tone(440, 1), RATE)
    expect(spec.length).toBe(frameCount(RATE, RATE) * BAND_COUNT)
    expect(spec.length / BAND_COUNT).toBe(SPECTRUM_FPS)
    const mid = 15 * BAND_COUNT
    expect(spec[mid + 1]).toBe(255)
    expect(spec[mid + 0]).toBeLessThan(40)
    expect(spec[mid + 2]).toBeLessThan(40)
    expect(spec[mid + 3]).toBeLessThan(40)
  })

  it('120 Гц → полоса 0, 2 кГц → полоса 2, 5 кГц → полоса 3', () => {
    for (const [hz, band] of [[120, 0], [2000, 2], [5000, 3]]) {
      const spec = computeBands(tone(hz, 0.5), RATE)
      const f = 7 * BAND_COUNT
      const row = [0, 1, 2, 3].map(b => spec[f + b])
      expect(row.indexOf(Math.max(...row))).toBe(band)
    }
  })

  it('тихий файл нормируется так же, как громкий (перцентиль)', () => {
    const loud = computeBands(tone(440, 0.5, 0.9), RATE)
    const quiet = computeBands(tone(440, 0.5, 0.02), RATE)
    expect(quiet[7 * BAND_COUNT + 1]).toBe(loud[7 * BAND_COUNT + 1])
  })

  it('async-версия слайсами даёт тот же результат', async () => {
    const s = tone(440, 9)
    expect(await computeBandsAsync(s, RATE)).toEqual(computeBands(s, RATE))
  })
})

describe('normalizeBands', () => {
  it('опора полосы не ниже доли от самой громкой: шум в пустой полосе не раздувается', () => {
    const raw = new Float32Array(10 * BAND_COUNT)
    for (let f = 0; f < 10; f++) { raw[f * 4] = 1; raw[f * 4 + 3] = 0.001 }
    const out = normalizeBands(raw)
    expect(out[0]).toBe(255)
    expect(out[3]).toBeLessThan(60)
  })
})

describe('spectrumBandsAt', () => {
  it('кадр по времени, края зажаты, без спектра — false', () => {
    const spec = Uint8Array.from([255, 0, 0, 0, 0, 255, 0, 0])
    const out = new Float32Array(4)
    expect(spectrumBandsAt(spec, 0, out)).toBe(true)
    expect(out[0]).toBe(1)
    spectrumBandsAt(spec, 1 / SPECTRUM_FPS, out)
    expect(out[1]).toBe(1)
    spectrumBandsAt(spec, 99, out)
    expect(out[1]).toBe(1)
    expect(spectrumBandsAt(null, 0, out)).toBe(false)
  })
})

describe('кэш спектров: LRU ≤ 24, разбор без OfflineAudioContext — null', () => {
  it('старые вытесняются, обращение освежает', () => {
    for (let i = 0; i < 30; i++) hooks.seed(`k${i}`, new Uint8Array(4))
    expect(hooks.size()).toBe(24)
    expect(peekSpectrum('k5')).toBe(null)
    expect(peekSpectrum('k6')).not.toBe(null)
    peekSpectrum('k6')
    hooks.seed('new', new Uint8Array(4))
    expect(peekSpectrum('k6')).not.toBe(null)   // освежённый остался
    expect(peekSpectrum('k7')).toBe(null)       // вытеснился самый старый
  })

  it('нет OfflineAudioContext (node) — файл помечается null, повтор запроса не ставится', async () => {
    requestSpectrum('file-a', 'blob:x')
    requestSpectrum('file-a', 'blob:x')
    await new Promise(r => setTimeout(r, 400))
    expect(hooks.keys()).toEqual(['file-a'])
    expect(peekSpectrum('file-a')).toBe(null)
  })
})
