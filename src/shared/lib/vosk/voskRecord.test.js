import { describe, it, expect } from 'vitest'
import { createRecorder, buildClip, encodeWavBytes, resampleTo16k, toInt16, wavePeaks, REC_RATE, PEAK_BARS, PAD_MS, MAX_PAUSE_MS, OVER_MS } from './voskRecord.js'

// Запись голосового ответа из потока Vosk: обрезка тишины, WAV-заголовок, столбики волны, ужатие длинных пауз, потолок памяти, отключение.
const tone = (ms, amp = 0.3, rate = REC_RATE) => Float32Array.from({ length: Math.round((rate * ms) / 1000) }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / rate))
const quiet = (ms, rate = REC_RATE) => new Float32Array(Math.round((rate * ms) / 1000))
const cat = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
const feed = (rec, f32, chunk = 2048) => { for (let i = 0; i < f32.length; i += chunk) rec.push(f32.subarray(i, i + chunk)) }
const ms = clip => clip.durationMs

describe('encodeWavBytes: заголовок WAV', () => {
  it('RIFF/WAVE, PCM16, моно, 16 кГц, размеры сходятся', () => {
    const b = encodeWavBytes(Int16Array.from([0, 1000, -1000, 32767]))
    const v = new DataView(b.buffer)
    const tag = o => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(v.getUint32(4, true)).toBe(36 + 8)
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(1) // моно
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(28, true)).toBe(32000) // байт в секунду
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(8)
    expect(b.length).toBe(44 + 8)
    expect(v.getInt16(46, true)).toBe(1000)
    expect(v.getInt16(50, true)).toBe(32767)
  })
})

describe('toInt16 / resampleTo16k / wavePeaks', () => {
  it('отсечение за пределами ±1; 48 кГц → 16 кГц втрое короче; 16 кГц не трогаем', () => {
    expect(Array.from(toInt16(Float32Array.from([2, -2, 0.5])))).toEqual([32767, -32768, 16384])
    const s = new Int16Array(4800)
    expect(resampleTo16k(s, 48000).length).toBe(1600)
    expect(resampleTo16k(s, 16000)).toBe(s)
  })
  it('столбики: PEAK_BARS штук, 0..1, самый громкий = 1', () => {
    const f = toInt16(cat(tone(400, 0.1), tone(400, 0.4), tone(400, 0.2)))
    const p = wavePeaks(f)
    expect(p).toHaveLength(PEAK_BARS)
    expect(Math.max(...p)).toBe(1)
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0)
    expect(p[Math.floor(PEAK_BARS / 2)]).toBeGreaterThan(p[2]) // середина (0,4) громче начала (0,1)
  })
})

describe('buildClip: обрезка тишины и ужатие пауз', () => {
  const raw = f => toInt16(f)
  it('тишина в начале и конце срезана с запасом PAD_MS; длительность ≈ речь + 2×запас; WAV audio/wav', () => {
    const c = buildClip(raw(cat(quiet(1500), tone(1000), quiet(1200))))
    expect(c.ok).toBe(true)
    expect(c.blob.type).toBe('audio/wav')
    expect(c.blob.size).toBe(44 + Math.round((ms(c) / 1000) * REC_RATE) * 2)
    expect(ms(c)).toBeGreaterThanOrEqual(1000 + 2 * PAD_MS - 60)
    expect(ms(c)).toBeLessThanOrEqual(1000 + 2 * PAD_MS + 60)
    expect(c.peaks).toHaveLength(PEAK_BARS)
  })
  it('длинная пауза между словами ужимается до MAX_PAUSE_MS, короткая остаётся как есть', () => {
    const long = buildClip(raw(cat(tone(500), quiet(2500), tone(500))))
    expect(ms(long)).toBeLessThanOrEqual(1000 + MAX_PAUSE_MS + 60)
    expect(ms(long)).toBeLessThan(2000)
    const short = buildClip(raw(cat(tone(500), quiet(300), tone(500))))
    expect(ms(short)).toBeGreaterThanOrEqual(1300 - 40) // запись без тишины по краям: запасу негде появиться; пауза 300 мс не тронута
  })
  it('ничего не записано / только тишина / щелчок → ok:false с причиной, без блоба', () => {
    expect(buildClip(new Int16Array(0))).toEqual({ ok: false, reason: 'empty' })
    expect(buildClip(raw(quiet(2000)))).toEqual({ ok: false, reason: 'silent' })
    const click = buildClip(raw(cat(quiet(500), tone(40), quiet(500))))
    expect(click).toEqual({ ok: false, reason: 'short' })
  })
  it('запись на 48 кГц приводится к 16 кГц (длительность та же)', () => {
    const c = buildClip(toInt16(cat(quiet(500, 48000), tone(800, 0.3, 48000), quiet(500, 48000))), 48000)
    expect(c.ok).toBe(true)
    expect(ms(c)).toBeGreaterThan(800)
    expect(ms(c)).toBeLessThan(800 + 2 * PAD_MS + 80)
  })
})

describe('createRecorder: буфер сеанса', () => {
  it('собирает куски, finish() даёт клип и освобождает буфер (повторный finish — пусто)', () => {
    const rec = createRecorder({})
    feed(rec, cat(quiet(300), tone(900), quiet(300)))
    expect(rec.samples).toBe(Math.round(REC_RATE * 1.5))
    const clip = rec.finish()
    expect(clip.ok).toBe(true)
    expect(rec.samples).toBe(0)
    expect(rec.finish()).toEqual({ ok: false, reason: 'empty' })
  })
  it('потолок: сверх maxMs + OVER_MS отсчёты не копятся, клип всё равно собирается, truncated', () => {
    const rec = createRecorder({ maxMs: 1000 })
    feed(rec, tone(1000 + OVER_MS + 3000))
    expect(rec.samples).toBe(Math.ceil((REC_RATE * (1000 + OVER_MS)) / 1000))
    expect(rec.truncated).toBe(true)
    const clip = rec.finish()
    expect(clip.ok).toBe(true)
    expect(clip.truncated).toBe(true)
    expect(ms(clip)).toBeLessThanOrEqual(1000 + OVER_MS + 20)
  })
  it('reset() выбрасывает всё; пустые и битые куски игнорируются; исходный буфер не удерживается', () => {
    const rec = createRecorder({})
    const src = tone(500)
    rec.push(src); rec.push(null); rec.push(new Float32Array(0))
    src.fill(0) // меняем исходник: запись уже скопирована
    rec.reset()
    expect(rec.samples).toBe(0)
    rec.push(tone(700))
    src.fill(0)
    expect(rec.finish().ok).toBe(true)
  })
  it('слом сборки не бросает: { ok: false, reason: "error" }', () => {
    const rec = createRecorder({})
    rec.push(tone(500))
    const real = globalThis.Blob
    globalThis.Blob = function () { throw new Error('нет Blob') }
    try { expect(rec.finish()).toEqual({ ok: false, reason: 'error' }) } finally { globalThis.Blob = real }
  })
})
