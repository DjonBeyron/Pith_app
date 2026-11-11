import { describe, it, expect, vi } from 'vitest'
import { createVoiceSetRun, createMiniTrace } from './voiceSetRun.js'
import { buildArchives, manifestText } from './voiceSetExport.js'
import { createMemoryStore } from './voiceSetStore.js'
import { createWake } from './voiceSetWake.js'
import { readSetPrefs, writeSetPrefs, PREFS_KEY, DEFAULTS } from './voiceSetPrefs.js'
import { buildPlan, WORD_MS, PRE_MS } from './voiceSetPlan.js'
import { decodeWav } from './voiceSetWav.js'

// Запись набора «в сборе» на подставном захвате: клип → 16 кГц WAV → хранилище → архив с манифестом; оглохший микрофон; экран не гаснет; настройки
const RATE = 48000, N = 2048, CH = N / RATE * 1000
const tick = () => new Promise(r => setTimeout(r, 0))

function rig({ clips = [], meta = { skipped: [], captures: [] } } = {}) {
  const plan = buildPlan({ words: ['house'], reps: 1 }).filter(x => x.kind === 'word')
  plan.forEach((it, i) => { it.i = i })
  const store = createMemoryStore(), states = [], levels = []
  let feedChunk = null, t = 0, last = 0
  const cap = { rate: RATE, gain: 2, lastAt: () => last, stop: vi.fn(), resume: vi.fn() }
  const run = createVoiceSetRun({
    store, plan, meta, clips, version: '3.3.187', onState: s => states.push(s), onLevel: (g, v) => levels.push([g, v]), now: () => t,
    getStream: () => ({ id: 'stream' }), capture: ({ onChunk }) => { feedChunk = onChunk; return cap },
    describe: () => ({ constraints: { echoCancellation: false }, settings: { sampleRate: RATE } }),
  })
  let phase = 0
  /** ms звука: тон 300 Гц амплитудой amp (0 — ровный ноль) */
  const feed = (ms, amp = 0.0002) => {
    for (let k = 0; k < ms / CH; k++) {
      const data = Float32Array.from({ length: N }, () => amp * Math.SQRT2 * Math.sin(2 * Math.PI * 300 * phase++ / RATE))
      t += CH; last = t; feedChunk({ data, rms: amp, game: amp * 3.3, ms: CH })
    }
  }
  return { run, store, states, levels, feed, cap, plan, advance: ms => { t += ms } }
}

describe('запись набора в сборе', () => {
  it('клип: предзапись + окно → WAV 16 кГц в хранилище, запись манифеста с уровнями исходного звука', async () => {
    vi.useFakeTimers()
    const r = rig()
    expect(r.run.open()).toBe(true)
    r.run.session.start(); r.feed(800); vi.advanceTimersByTime(2100); r.feed(600); r.feed(500, 0.004); r.feed(WORD_MS)
    vi.useRealTimers(); await tick(); await tick()
    const got = await r.store.load()
    expect(got.clips).toHaveLength(1)
    const c = got.clips[0], wav = decodeWav(new Uint8Array(await r.store.getAudio(0)))
    expect(c).toMatchObject({ i: 0, kind: 'word', word: 'house', variant: 'whole', sampleRate: 16000, srcRate: 48000, rmsPeak: 0.004, far: false })
    expect(c.gamePeak).toBeCloseTo(0.0132, 4)
    expect(c.voiceMs).toBeGreaterThan(400)
    expect(wav.rate).toBe(16000)
    expect(Math.abs(wav.samples.length / 16 - c.ms)).toBeLessThan(2)
    expect(c.ms).toBeGreaterThanOrEqual(WORD_MS + PRE_MS)
    expect(c.bytes).toBe(44 + wav.samples.length * 2)
    expect(c.chunkMs).toBeCloseTo(CH, 2); expect(c.env).toHaveLength(Math.round(c.ms / CH)) // огибающая исходного звука — по числу на кусок
    expect(Math.max(...c.env)).toBe(4000); expect(Math.min(...c.env)).toBe(200)
    let peak = 0 // уровень в WAV — как в исходном звуке: самый громкий кусок (683 отсчёта при 16 кГц = 2048 при 48 кГц)
    for (let o = 0; o + 683 <= wav.samples.length; o += 171) { let q = 0; for (let k = o; k < o + 683; k++) q += wav.samples[k] ** 2; peak = Math.max(peak, Math.sqrt(q / 683)) }
    expect(peak / 0.004).toBeGreaterThan(0.97); expect(peak / 0.004).toBeLessThan(1.03)
    expect(got.meta).toMatchObject({ micGain: 2, constraints: { echoCancellation: false } })
    expect(got.meta.captures.at(-1)).toMatchObject({ ctxRate: 48000, version: '3.3.187', track: { sampleRate: 48000 } })
    expect(r.levels.some(([, v]) => v)).toBe(true)
    expect(r.states.at(-1)).toMatchObject({ phase: 'gap', i: 1, done: 1 })
  })
  it('ровный ноль в клипе — микрофон оглох: клип не сохранён, пауза с причиной «микрофон», сигнал здоровью микрофона', async () => {
    vi.useFakeTimers()
    const r = rig(), seen = []
    r.run.trace.subscribe(e => { if (e.k !== 'level' || e.z) seen.push(e) })
    r.run.open(); r.run.session.start(); r.feed(800); vi.advanceTimersByTime(2100); r.feed(1000); r.feed(WORD_MS, 0)
    vi.useRealTimers(); await tick(); await tick()
    expect((await r.store.load()).clips).toHaveLength(0)
    expect(r.states.at(-1)).toMatchObject({ phase: 'paused', pauseWhy: 'mic', done: 0 })
    expect(seen.some(e => e.k === 'level' && e.z)).toBe(true)
    expect(seen.some(e => e.k === 'listen' && e.status === 'dead')).toBe(true)
  })
  it('короткий ровный ноль (поток только открылся) клип не бракует; сбои микрофона прошлого захода записи остаются в наборе', async () => {
    vi.useFakeTimers()
    const r = rig({ meta: { skipped: [], captures: [], micEvents: [{ t: 5, k: 'mic-dead', why: 'mute', at: '2026-11-11T10:00:00.000Z' }] } })
    r.run.open(); r.run.session.start(); r.feed(800); vi.advanceTimersByTime(2100); r.feed(400); r.feed(200, 0); r.feed(500, 0.004); r.feed(WORD_MS)
    vi.useRealTimers(); await tick(); await tick()
    const got = await r.store.load()
    expect(got.clips).toHaveLength(1)
    expect(got.clips[0].zeros).toBeGreaterThan(2)
    r.run.trace.push('mic-revive', { how: 'тап' })
    await r.run.close()
    expect((await r.store.load()).meta.micEvents.map(e => e.k)).toEqual(['mic-dead', 'mic-revive'])
  })
  it('сторож: кусков звука нет дольше 1,5 с — захват встал; нет потока — захват не открывается', () => {
    const r = rig()
    r.run.open(); r.feed(100)
    expect(r.run.stalled()).toBe(false)
    r.advance(1600)
    expect(r.run.stalled()).toBe(true)
    r.run.close()
    expect(r.cap.stop).toHaveBeenCalled()
    const none = createVoiceSetRun({ store: createMemoryStore(), plan: r.plan, meta: {}, getStream: () => null, capture: () => { throw new Error('не должен открываться') } })
    expect(none.open()).toBe(false)
  })
  it('мини-трасса: подписчики получают всё, в журнал сбоев уровень не идёт', () => {
    const tr = createMiniTrace({ now: () => 5 }), got = []
    tr.subscribe(e => got.push(e.k))
    tr.push('level', { z: 1 }); tr.push('mic-dead', { why: 'mute' })
    expect(got).toEqual(['level', 'mic-dead'])
    expect(tr.log().map(e => e.k)).toEqual(['mic-dead'])
  })
})

describe('архив набора', () => {
  it('части — самостоятельные ZIP: manifest.json первым, клипы — байт в байт; клип без звука в архив не идёт', async () => {
    const store = createMemoryStore(), clips = [0, 1, 2, 3].map(i => ({ i, file: `clips/00${i + 1}_w_whole_1.wav`, bytes: 1000, sampleRate: 16000, preMs: 500 }))
    for (const c of clips.slice(0, 3)) await store.putClip(c, Uint8Array.from({ length: 1000 }, (_, k) => (k + c.i) & 255).buffer)
    const parts = await buildArchives({ store, meta: { version: '3.3.187', settings: {}, captures: [{ ctxRate: 48000, track: {} }], planCount: 10 }, clips, now: new Date(2026, 10, 11, 9, 7), max: 2400 + 262144 })
    expect(parts.map(p => [p.name, p.count, p.part, p.parts])).toEqual([['pithy-voiceset-2026-11-11_09-07-part1of2.zip', 2, 1, 2], ['pithy-voiceset-2026-11-11_09-07-part2of2.zip', 1, 2, 2]])
    expect(parts[1].missing).toEqual(['clips/004_w_whole_1.wav'])
    const buf = new Uint8Array(await parts[0].blob.arrayBuffer()), v = new DataView(buf.buffer)
    expect(parts[0].size).toBe(buf.length)
    expect(new TextDecoder().decode(buf.slice(30, 43))).toBe('manifest.json')
    const m = JSON.parse(new TextDecoder().decode(buf.slice(43, 43 + v.getUint32(18, true))))
    expect(m).toMatchObject({ kind: 'pithy-voiceset', part: 1, parts: 2, clipsInSet: 4, planCount: 10 })
    expect(m.clips.map(c => c.file)).toEqual(['clips/001_w_whole_1.wav', 'clips/002_w_whole_1.wav'])
    const txt = manifestText({ clips: [{ file: 'a', env: [100, 98, 4000], far: false }], skipped: [3, 7], empty: [] }) // огибающая — одной строкой, остальное с отступами
    expect(txt).toContain('"env": [100,98,4000]'); expect(txt).toContain('"skipped": [3,7]'); expect(txt.split('\n').length).toBeGreaterThan(6)
    expect(JSON.parse(txt)).toEqual({ clips: [{ file: 'a', env: [100, 98, 4000], far: false }], skipped: [3, 7], empty: [] })
    const at = 43 + v.getUint32(18, true)
    expect(new TextDecoder().decode(buf.slice(at + 30, at + 30 + 23))).toBe('clips/001_w_whole_1.wav')
    expect([...buf.slice(at + 53, at + 57)]).toEqual([0, 1, 2, 3])
  })
})

describe('экран не гаснет и настройки', () => {
  it('Wake Lock: запрос, повтор после возврата из фона, снятие; нет API — тихо', async () => {
    const locks = [], doc = { visibilityState: 'visible', subs: {}, addEventListener(k, f) { this.subs[k] = f }, removeEventListener(k) { delete this.subs[k] } }
    const nav = { wakeLock: { request: vi.fn(async () => { const l = { released: false, on: {}, addEventListener(k, f) { this.on[k] = f }, release: async () => { l.released = true } }; locks.push(l); return l }) } }
    const w = createWake({ nav, doc })
    expect(w.supported()).toBe(true)
    await w.on()
    expect(w.held()).toBe(true)
    locks[0].on.release() // система сняла блокировку (страница ушла в фон)
    expect(w.held()).toBe(false)
    doc.subs.visibilitychange(); await tick()
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2)
    w.off()
    expect(locks[1].released).toBe(true); expect(doc.subs.visibilitychange).toBeUndefined()
    const none = createWake({ nav: {}, doc })
    expect(none.supported()).toBe(false)
    await none.on(); expect(none.held()).toBe(false); none.off()
  })
  it('настройки помнятся; мусор — по умолчанию', () => {
    const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
    expect(readSetPrefs(store)).toEqual(DEFAULTS)
    writeSetPrefs({ words: 'sun, moon', reps: 1, far: true }, store)
    expect(readSetPrefs(store)).toEqual({ words: 'sun, moon', reps: 1, far: true })
    mem.set(PREFS_KEY, '{"words":"  ","reps":9,"far":"да"}')
    expect(readSetPrefs(store)).toEqual(DEFAULTS)
    mem.set(PREFS_KEY, '{oops')
    expect(readSetPrefs(store)).toEqual(DEFAULTS)
  })
})
