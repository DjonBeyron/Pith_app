import { describe, it, expect, vi, afterEach } from 'vitest'
import { rmsOf, peakOf, trimSilence, normalizeRms, encodeWav, mixToMono, normalizeSamples, normalizeToWav, SFX_TARGET_RMS, SFX_PEAK_LIMIT, SFX_RATE, SFX_MAX_SEC } from './audioNormalize.js'

const RATE = SFX_RATE
// Синус freq Гц длиной ms мс с амплитудой amp
const tone = (ms, amp, freq = 440) => Float32Array.from({ length: Math.round((RATE * ms) / 1000) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / RATE))
const concat = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length }); return out }
const zeros = ms => new Float32Array(Math.round((RATE * ms) / 1000))
// Из WAV обратно в Float32
const readWav = wav => { const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength); return Float32Array.from({ length: (wav.length - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true) / 32767) }

afterEach(() => vi.unstubAllGlobals())

describe('нормализация громкости звука награды (чистые функции)', () => {
  it('цель — RMS 1300 из 32767 (как у синтезированных мяу)', () => {
    expect(SFX_TARGET_RMS * 32767).toBeCloseTo(1300, 5)
  })

  it('тихий и громкий сигнал после нормализации имеют один RMS ≈ цели (±3 %)', () => {
    ;[0.02, 0.1, 0.6].forEach(amp => {
      const out = normalizeRms(tone(400, amp))
      expect(Math.abs(rmsOf(out) - SFX_TARGET_RMS) / SFX_TARGET_RMS).toBeLessThan(0.03)
    })
  })

  it('короткие импульсные звуки не клиппируют: пик ограничен, громкость снижается', () => {
    const spike = concat(zeros(100), tone(8, 1), zeros(200)) // очень высокий пик при малом RMS
    const out = normalizeRms(spike)
    expect(peakOf(out)).toBeLessThanOrEqual(SFX_PEAK_LIMIT + 1e-6)
    expect(rmsOf(out)).toBeLessThan(SFX_TARGET_RMS) // цель по RMS недостижима без клиппинга — берём меньшую
  })

  it('мягкие края: первый и последний отсчёты почти ноль (нет щелчка)', () => {
    const out = normalizeRms(tone(300, 0.5))
    expect(Math.abs(out[0])).toBeLessThan(1e-3)
    expect(Math.abs(out[out.length - 1])).toBeLessThan(1e-3)
  })

  it('тишина остаётся тишиной (нет деления на ноль)', () => {
    const out = normalizeRms(zeros(100))
    expect(out.every(x => x === 0)).toBe(true)
  })

  it('trimSilence режет тишину по краям, оставляя запас; середина цела', () => {
    const src = concat(zeros(300), tone(200, 0.4), zeros(400))
    const out = trimSilence(src)
    const ms = (out.length / RATE) * 1000
    expect(ms).toBeGreaterThanOrEqual(200)
    expect(ms).toBeLessThan(200 + 2 * 40) // сам звук + запас ~15 мс + округление окон по краям
    expect(rmsOf(out)).toBeGreaterThan(rmsOf(src))
  })

  it('trimSilence: полная тишина → пустой массив; звук без тишины не меняется по длине', () => {
    expect(trimSilence(zeros(200))).toHaveLength(0)
    expect(trimSilence(new Float32Array(0))).toHaveLength(0)
    const s = tone(200, 0.4)
    expect(trimSilence(s).length).toBe(s.length)
  })

  it('encodeWav: заголовок RIFF/WAVE, 22050 Гц, 16 бит, моно; размер данных сходится', () => {
    const wav = encodeWav(tone(100, 0.5))
    const v = new DataView(wav.buffer)
    const tag = (o, n) => String.fromCharCode(...wav.subarray(o, o + n))
    expect(tag(0, 4)).toBe('RIFF'); expect(tag(8, 4)).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1); expect(v.getUint32(24, true)).toBe(RATE); expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(wav.length - 44)
  })

  it('encodeWav зажимает значения вне −1…1 (без переполнения Int16)', () => {
    const back = readWav(encodeWav(Float32Array.from([2, -2, 0.5])))
    expect(back[0]).toBeCloseTo(1, 3); expect(back[1]).toBeCloseTo(-1, 3); expect(back[2]).toBeCloseTo(0.5, 3)
  })

  it('mixToMono: среднее каналов; один канал копируется', () => {
    const m = mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])])
    expect(Array.from(m)).toEqual([0.5, 0.5])
    expect(Array.from(mixToMono([Float32Array.from([0.25])]))).toEqual([0.25])
    expect(mixToMono([])).toHaveLength(0)
  })

  it('normalizeSamples: тишина по краям убрана, RMS WAV ≈ 1300/32767, длина в мс', () => {
    const r = normalizeSamples(concat(zeros(250), tone(500, 0.9), zeros(250)))
    expect(r.ms).toBeGreaterThanOrEqual(500); expect(r.ms).toBeLessThan(580)
    const back = readWav(r.wav)
    expect(Math.abs(rmsOf(back) - SFX_TARGET_RMS) / SFX_TARGET_RMS).toBeLessThan(0.04)
    expect(Math.abs(r.rms - rmsOf(back)) / r.rms).toBeLessThan(0.02)
    expect(r.peak).toBeLessThanOrEqual(SFX_PEAK_LIMIT + 1e-6)
  })

  it('normalizeSamples: тишина и слишком длинный файл — понятные ошибки', () => {
    expect(() => normalizeSamples(zeros(300))).toThrow(/тишина/)
    expect(() => normalizeSamples(new Float32Array(RATE * (SFX_MAX_SEC + 1)), RATE)).toThrow(/длиннее/)
  })
})

describe('normalizeToWav: декодирование браузером', () => {
  it('берёт все каналы и частоту декодера, отдаёт WAV', async () => {
    const left = tone(300, 0.7); const right = tone(300, 0.7, 660)
    const decodeAudioData = vi.fn(async () => ({ numberOfChannels: 2, sampleRate: RATE, getChannelData: c => (c === 0 ? left : right) }))
    vi.stubGlobal('OfflineAudioContext', class { constructor(...a) { this.args = a } decodeAudioData(b) { return decodeAudioData(b) } })
    const r = await normalizeToWav(new ArrayBuffer(8))
    expect(decodeAudioData).toHaveBeenCalledTimes(1)
    expect(Math.abs(rmsOf(readWav(r.wav)) - SFX_TARGET_RMS) / SFX_TARGET_RMS).toBeLessThan(0.04)
  })

  it('нет OfflineAudioContext или файл не разбирается — понятная ошибка', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined); vi.stubGlobal('webkitOfflineAudioContext', undefined)
    await expect(normalizeToWav(new ArrayBuffer(8))).rejects.toThrow(/OfflineAudioContext/)
    vi.stubGlobal('OfflineAudioContext', class { decodeAudioData() { return Promise.reject(new Error('bad')) } })
    await expect(normalizeToWav(new ArrayBuffer(8))).rejects.toThrow(/wav, mp3 или m4a/)
  })
})
