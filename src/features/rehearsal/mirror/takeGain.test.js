import { describe, it, expect, vi } from 'vitest'
import { takeGain, bufferGain, TAKE_TARGET_RMS, TAKE_PEAK_CEIL, TAKE_MAX_GAIN, TAKE_MIN_GAIN, TARGET_MIN, TARGET_MAX } from './takeGain.js'
import { playTakeBuffer } from './takeBuffer.js'
import { voicedRms } from './mirrorRms.js'

// Синус громкостью amp (пик) на rate Гц: RMS = amp / √2
const tone = (amp, sec = 1, rate = 8000) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / rate))
const fakeBuffer = (samples, rate = 8000) => ({ numberOfChannels: 1, sampleRate: rate, getChannelData: () => samples, duration: samples.length / rate })

describe('takeGain: дубль с микрофона выравнивается по громкости голоса Пита', () => {
  it('тихая запись усиливается до цели: RMS 0,02 при цели 0,1 → ×5', () => {
    expect(takeGain({ rms: 0.02, peak: 0.1, targetRms: 0.1 })).toBeCloseTo(5, 5)
  })
  it('нет цели (громкость диктора неизвестна) — берётся TAKE_TARGET_RMS; цель из файлов диктора зажата границами', () => {
    expect(takeGain({ rms: 0.02, peak: 0.1 })).toBeCloseTo(TAKE_TARGET_RMS / 0.02, 5)
    expect(takeGain({ rms: 0.05, peak: 0.1, targetRms: 0.9 })).toBeCloseTo(TARGET_MAX / 0.05, 5)
    expect(takeGain({ rms: 0.025, peak: 0.1, targetRms: 0.001 })).toBeCloseTo(TARGET_MIN / 0.025, 5)
  })
  it('потолок по пику: после усиления пик не выше TAKE_PEAK_CEIL — не клиппит', () => {
    const g = takeGain({ rms: 0.02, peak: 0.5, targetRms: 0.1 }) // по RMS вышло бы ×5 → пик 2,5
    expect(g * 0.5).toBeCloseTo(TAKE_PEAK_CEIL, 5)
    expect(g).toBeLessThan(5)
  })
  it('усиление не больше TAKE_MAX_GAIN (шум комнаты не раздуваем), громкую запись прижимаем не тише TAKE_MIN_GAIN', () => {
    expect(takeGain({ rms: 0.001, peak: 0.01, targetRms: 0.1 })).toBe(TAKE_MAX_GAIN)
    expect(takeGain({ rms: 0.4, peak: 0.5, targetRms: 0.05 })).toBe(TAKE_MIN_GAIN)
  })
  it('тишина / нет цифр — играем как есть (×1)', () => {
    expect(takeGain({ rms: 0, peak: 0 })).toBe(1)
    expect(takeGain({ rms: undefined, peak: 0.3 })).toBe(1)
  })
})

describe('bufferGain: множитель по AudioBuffer', () => {
  it('тихий синус (пик 0,05) усиливается так, что голос стоит на цели, а пик ниже потолка', () => {
    const samples = tone(0.05)
    const g = bufferGain(fakeBuffer(samples), 0.1)
    expect(g).toBeGreaterThan(1.5)
    expect(voicedRms(samples, 8000) * g).toBeCloseTo(0.1, 2)
    expect(0.05 * g).toBeLessThanOrEqual(TAKE_PEAK_CEIL + 1e-9)
  })
  it('молчание до и после фразы цель не сбивает (считается RMS только голосовых окон)', () => {
    const voice = tone(0.05)
    const padded = new Float32Array(voice.length * 3); padded.set(voice, voice.length)
    expect(bufferGain(fakeBuffer(padded), 0.1)).toBeCloseTo(bufferGain(fakeBuffer(voice), 0.1), 1)
  })
  it('стерео смешивается в моно; нет каналов / данных — ×1', () => {
    const a = tone(0.05)
    expect(bufferGain({ numberOfChannels: 2, sampleRate: 8000, getChannelData: () => a }, 0.1)).toBeCloseTo(bufferGain(fakeBuffer(a), 0.1), 5)
    expect(bufferGain({ duration: 1 }, 0.1)).toBe(1); expect(bufferGain(null)).toBe(1)
  })
})

describe('playTakeBuffer: играет с множителем громкости', () => {
  it('gain из takeGain и onStart передаются в playGameBuffer; цель берётся из targetRms', async () => {
    const samples = tone(0.05)
    const play = vi.fn((b, o) => { o.onStart(); queueMicrotask(o.onEnd); return true })
    const onStart = vi.fn()
    expect(await playTakeBuffer({ size: 11 }, { decode: async () => fakeBuffer(samples), play, targetRms: 0.1, onStart })).toBe('ended')
    expect(play.mock.calls[0][1].gain).toBeCloseTo(bufferGain(fakeBuffer(samples), 0.1), 5)
    expect(play.mock.calls[0][1].gain).toBeGreaterThan(1.5)
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
