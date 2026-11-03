import { describe, it, expect, vi } from 'vitest'
import { voiceSpan, PAD_MS } from './voiceSpan.js'
import { sliceBuffer } from './bufferSlice.js'
import { playTakeBuffer } from './takeBuffer.js'
import { studentOf } from '../rehearsalMirror.js'

// v3.3.101: тишина до и после речи в дубле срезается — играем, считаем и показываем только речь с запасом 120 мс по краям
const RATE = 8000
// запись: шум шума, потом речь (синус) с from до to мс, снова шум; всего total мс
function take({ total = 3000, from = 1000, to = 1800, noise = 0.002, voice = 0.2 } = {}) {
  const a = new Float32Array(Math.round(RATE * total / 1000))
  for (let i = 0; i < a.length; i++) {
    const t = i / RATE * 1000
    a[i] = (Math.random() - 0.5) * 2 * noise + (t >= from && t < to ? Math.sin(2 * Math.PI * 220 * i / RATE) * voice : 0)
  }
  return a
}

describe('voiceSpan: где в записи речь', () => {
  it('тишина с двух сторон срезается, запас 120 мс по краям', () => {
    const s = voiceSpan(take(), RATE)
    expect(s.startMs).toBeGreaterThanOrEqual(1000 - PAD_MS - 25); expect(s.startMs).toBeLessThanOrEqual(1000 - PAD_MS + 25)
    expect(s.endMs).toBeGreaterThanOrEqual(1800 + PAD_MS - 25); expect(s.endMs).toBeLessThanOrEqual(1800 + PAD_MS + 25)
  })
  it('порог относительно шума: шумная комната (шум 0.02) и тихая речь (0.15) тоже находятся', () => {
    const s = voiceSpan(take({ noise: 0.02, voice: 0.15 }), RATE)
    expect(s.startMs).toBeGreaterThan(700); expect(s.endMs).toBeLessThan(2200)
  })
  it('края не выходят за запись (речь у самого начала и конца)', () => {
    const s = voiceSpan(take({ total: 3000, from: 50, to: 2950 }), RATE)
    expect(s).toBeNull() // обрезать нечего
    const t = voiceSpan(take({ total: 3000, from: 20, to: 1200 }), RATE)
    expect(t.startMs).toBe(0); expect(t.endMs).toBeLessThanOrEqual(3000)
  })
  it('речи нет — null (играем как есть)', () => {
    expect(voiceSpan(take({ voice: 0 }), RATE)).toBeNull()
    expect(voiceSpan(new Float32Array(RATE), RATE)).toBeNull()
    expect(voiceSpan(new Float32Array(10), RATE)).toBeNull()
  })
  it('одиночный слабый щелчок не считается речью', () => {
    const a = take({ voice: 0, noise: 0.002 }); for (let i = 4000; i < 4000 + 160; i++) a[i] = 0.012 // один кусок чуть выше пола
    expect(voiceSpan(a, RATE)).toBeNull()
  })
})

// поддельный AudioBuffer
const fakeBuffer = (n, rate = 1000) => ({ length: n, sampleRate: rate, numberOfChannels: 1, duration: n / rate, data: Float32Array.from({ length: n }, (_, i) => i), getChannelData() { return this.data } })
const makeBuffer = (ch, len, rate) => { const d = new Float32Array(len); return { length: len, sampleRate: rate, numberOfChannels: ch, duration: len / rate, getChannelData: () => d } }

describe('sliceBuffer: отрезок буфера', () => {
  it('копирует отрезок [start, end) в новый буфер', () => {
    const out = sliceBuffer(fakeBuffer(1000), { startMs: 200, endMs: 500 }, { makeBuffer })
    expect(out.length).toBe(300)
    expect(out.getChannelData(0)[0]).toBe(200); expect(out.getChannelData(0)[299]).toBe(499)
  })
  it('нет отрезка / отрезок на всю запись / нет способа создать буфер — исходный буфер', () => {
    const b = fakeBuffer(1000)
    expect(sliceBuffer(b, null)).toBe(b)
    expect(sliceBuffer(b, { startMs: 0, endMs: 5000 }, { makeBuffer })).toBe(b)
    expect(sliceBuffer(b, { startMs: 100, endMs: 200 }, { makeBuffer: () => null })).toBe(b)
    expect(sliceBuffer(b, { startMs: 100, endMs: 200 }, { makeBuffer: () => { throw new Error('x') } })).toBe(b)
  })
})

describe('playTakeBuffer с trim', () => {
  const run = async trim => {
    const buf = fakeBuffer(1000); const played = []
    const play = vi.fn((b, o) => { played.push(b); o.onStart?.(); o.onEnd?.(); return true })
    const res = await playTakeBuffer({}, { decode: async () => buf, play, trim, slice: (b, t) => ({ ...b, sliced: t }) })
    return { res, played }
  }
  it('с trim играется отрезок', async () => {
    const { res, played } = await run({ startMs: 100, endMs: 400 })
    expect(res).toBe('ended'); expect(played[0].sliced).toEqual({ startMs: 100, endMs: 400 })
  })
  it('без trim — вся запись', async () => {
    const { played } = await run(null)
    expect(played[0].sliced).toBeUndefined()
  })
})

describe('studentOf: данные дубля для зеркала', () => {
  const base = { url: 'u', blob: {}, rms: 0.1, durationMs: 3000 }
  const words = [{ word: 'a', start: 100, end: 300 }, { word: 'b', start: 1100, end: 1500 }, { word: 'c', start: 1600, end: 2200 }]
  it('без voice — запись как есть', () => {
    const s = studentOf(base, words)
    expect(s.durationMs).toBe(3000); expect(s.words).toBe(words); expect(s.trim).toBeUndefined()
  })
  it('с voice: длительность обрезанная, слова сдвинуты на начало обрезки, слова целиком до неё отброшены', () => {
    const s = studentOf({ ...base, voice: { startMs: 1000, endMs: 2000 } }, words)
    expect(s.durationMs).toBe(1000); expect(s.fullMs).toBe(3000); expect(s.trim).toEqual({ startMs: 1000, endMs: 2000 })
    expect(s.words).toEqual([{ word: 'b', start: 100, end: 500 }, { word: 'c', start: 600, end: 1000 }])
  })
})
