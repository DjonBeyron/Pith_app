import { describe, it, expect, vi } from 'vitest'
import { levelsOf, gainFor, normalizeBuffer, outputOf, idOfUrl, MAX_GAIN, LIMITER, PRESETS, readLoudness, writeLoudness, LOUDNESS_KEY, LOUDNESS_MODES } from './audioLoudness.js'

// Громкость (audioLoudness.js): пик → −1 dBFS, не больше ×4, RMS звучащих окон не выше −18 dBFS; лимитер на выходе контекста.
const RATE = 8000
const db = x => 20 * Math.log10(x)
const tone = (amp, sec = 0.5) => Float32Array.from({ length: Math.round(RATE * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / RATE))
const buf = ch => ({ numberOfChannels: 1, sampleRate: RATE, getChannelData: () => ch })
// «речь»: короткие пики поверх тихого фона (пик выше RMS на ~18 дБ)
const speech = () => { const a = tone(0.05, 1); for (let i = 0; i < a.length; i += 400) a[i] = 0.64; return a }

describe('нормализация при декодировании', () => {
  it('речь с пиком −3,9 dBFS: пик → −1 dBFS', () => {
    const ch = speech(), lv = levelsOf([ch], RATE)
    expect(db(lv.peak)).toBeCloseTo(-3.9, 0)
    const g = normalizeBuffer(buf(ch), 'pit', { log: () => {} })
    expect(g).toBeGreaterThan(1.3); expect(db(levelsOf([ch], RATE).peak)).toBeCloseTo(-1, 1)
  })
  it('синус: потолок по RMS (−18 dBFS), а не по пику — нота не становится громче речи', () => {
    const lv = levelsOf([tone(0.1)], RATE) // RMS ≈ −23 dBFS, пик −20
    const g = gainFor(lv)
    expect(db(lv.rms * g)).toBeCloseTo(-18, 1); expect(db(lv.peak * g)).toBeLessThan(-1)
  })
  it('очень тихий звук: не больше ×4', () => { expect(gainFor(levelsOf([tone(0.01)], RATE))).toBe(MAX_GAIN) })
  it('уже громкий — не трогаем (×1), тишина — ×1', () => {
    expect(gainFor(levelsOf([tone(0.95)], RATE))).toBe(1)
    expect(gainFor(levelsOf([new Float32Array(800)], RATE))).toBe(1)
  })
  it('один раз на буфер; журнал «[audio] громкость: … нормализация ×Y для «id» (peak …)»', () => {
    const ch = tone(0.05), b = buf(ch), log = vi.fn()
    normalizeBuffer(b, 'meow-1.wav', { log }); const after = ch[10]
    expect(normalizeBuffer(b, 'meow-1.wav', { log })).toBe(1); expect(ch[10]).toBe(after)
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/^\[audio\] громкость: сессия .+, мастер-gain 1, нормализация ×\d\.\d\d для «meow-1\.wav» \(peak −26\.0 dBFS/)
  })
  it('имя по адресу', () => { expect(idOfUrl('https://r2.dev/a/b/hello%20world.mp3?v=3')).toBe('hello world.mp3') })
})

describe('выход контекста: лимитер → мастер-gain → destination', () => {
  const fakeCtx = () => {
    const nodes = []
    const node = extra => { const n = { links: [], connect: t => n.links.push(t), ...extra }; nodes.push(n); return n }
    const ctx = { destination: { dest: true }, createGain: () => node({ gain: { value: 1 } }), createDynamicsCompressor: () => node({ threshold: { value: 0 }, ratio: { value: 0 }, knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }) }
    return { ctx, nodes }
  }
  it('один раз на контекст, параметры лимитера, цепочка до destination', () => {
    const { ctx, nodes } = fakeCtx(), log = vi.fn()
    const out = outputOf(ctx, { log })
    expect(outputOf(ctx, { log })).toBe(out); expect(log).toHaveBeenCalledTimes(1)
    expect(out.threshold.value).toBe(LIMITER.threshold); expect(out.ratio.value).toBe(4); expect(out.knee.value).toBe(10)
    expect(out.links[0]).toBe(nodes[1]); expect(nodes[1].gain.value).toBe(1); expect(nodes[1].links[0]).toBe(ctx.destination)
  })
  it('без DynamicsCompressor — прямо в destination', () => {
    const ctx = { destination: {}, createGain: () => ({}) }
    expect(outputOf(ctx, { log: () => {} })).toBe(ctx.destination)
  })

  it('режим «Громче»: по умолчанию normal; пресет loud — норма до RMS −14 и до ×8, второй компрессор-лимитер в конце цепочки', () => {
    const st = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m } })()
    expect(readLoudness(st)).toBe('normal')
    writeLoudness('loud', st); expect(readLoudness(st)).toBe('loud')
    st.setItem(LOUDNESS_KEY, 'мусор'); expect(readLoudness(st)).toBe('normal')
    writeLoudness('normal', st); expect(st.m.has(LOUDNESS_KEY)).toBe(false)
    const quiet = levelsOf([tone(0.02)], RATE)
    expect(gainFor(quiet, PRESETS.loud)).toBeGreaterThan(gainFor(quiet, PRESETS.normal))
    expect(gainFor(quiet, PRESETS.loud)).toBeLessThanOrEqual(PRESETS.loud.maxGain)
    expect(PRESETS.normal.limiter).toBe(null); expect(PRESETS.loud.limiter.threshold).toBe(-3)
    const make = () => { const nodes = []; const mk = () => { const n = { connect: vi.fn(), threshold: { value: 0 }, ratio: { value: 0 }, knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, gain: { value: 1 } }; nodes.push(n); return n }; return { nodes, destination: { id: 'dest' }, createDynamicsCompressor: mk, createGain: mk } }
    const prev = globalThis.localStorage
    globalThis.localStorage = st
    try {
      writeLoudness('loud', st)
      const ctx = make()
      outputOf(ctx, { log: () => {} })
      expect(ctx.nodes.filter(n => n.threshold.value === -28)).toHaveLength(1)
      expect(ctx.nodes.filter(n => n.threshold.value === -3)).toHaveLength(1)
      expect(ctx.nodes.some(n => n.gain.value === 1.4)).toBe(true)
    } finally { globalThis.localStorage = prev }
  })

  it('режимы louder / max: растут по громкости, в конце цепочки мягкий потолок (WaveShaper) и ceil < 1', () => {
    expect(LOUDNESS_MODES).toEqual(['normal', 'mid', 'loud', 'louder', 'max'])
    const quiet = levelsOf([tone(0.02)], RATE)
    const gains = LOUDNESS_MODES.map(m => gainFor(quiet, PRESETS[m]))
    expect(gains[1]).toBeGreaterThan(gains[0]); expect(gains[2]).toBeGreaterThanOrEqual(gains[1]); expect(gains[3]).toBeGreaterThanOrEqual(gains[2]); expect(gains[4]).toBeGreaterThanOrEqual(gains[3])
    expect(PRESETS.loud.shape).toBeUndefined(); expect(PRESETS.louder.shape).toBeGreaterThan(1); expect(PRESETS.max.ceil).toBeLessThan(1)
    const st = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } })()
    const prev = globalThis.localStorage
    globalThis.localStorage = st
    try {
      writeLoudness('max', st)
      const mk = () => ({ connect: vi.fn(), threshold: { value: 0 }, ratio: { value: 0 }, knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, gain: { value: 1 } })
      const shapers = []
      const ctx = { destination: { id: 'd' }, createDynamicsCompressor: mk, createGain: mk, createWaveShaper: () => { const w = { connect: vi.fn(), curve: null, oversample: 'none' }; shapers.push(w); return w } }
      outputOf(ctx, { log: () => {} })
      expect(shapers).toHaveLength(1)
      expect(shapers[0].curve).toBeInstanceOf(Float32Array)
      expect(Math.max(...shapers[0].curve)).toBeCloseTo(1, 5)
    } finally { globalThis.localStorage = prev }
  })
})
