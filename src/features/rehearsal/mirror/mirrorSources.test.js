import { describe, it, expect, vi } from 'vitest'
import { listenTake } from './mirrorListen.js'
import { dictorFromLibrary, libraryRms } from './dictorFromLibrary.js'
import { CHUNKS } from './mirrorFixtures.js'

// Источники данных для зеркала: слова Vosk с таймингами (listenTake) и диктор из кусков библиотеки (dictorFromLibrary)
const w = (word, start, end) => ({ word, conf: 1, start, end })
const flush = () => new Promise(r => setTimeout(r, 0))
const clock = () => { let t = 0; return { now: () => t, set: v => { t = v } } }

describe('listenTake: слова дубля с таймингами', () => {
  it('нет модели — ok false, no-model, слов нет, микрофон не трогаем', async () => {
    const listen = vi.fn()
    const r = await listenTake({ chunks: CHUNKS, stream: {}, runtime: { getModel: () => null }, listen }).done
    expect(r).toMatchObject({ ok: false, reason: 'no-model', words: [] })
    expect(listen).not.toHaveBeenCalled()
  })
  it('заходы: слова второго захода сдвигаются на его старт от начала дубля; заход на готовом потоке, без затвора тишины', async () => {
    const c = clock()
    const calls = []
    const sessions = []
    const listen = vi.fn(async (model, grammar, cb, opts) => { calls.push(opts); const h = { stop: vi.fn(), cancel: vi.fn() }; sessions.push({ cb, h }); return h })
    const stream = { id: 'game-stream' }
    const t = listenTake({ chunks: CHUNKS, stream, maxMs: 6000, runtime: { getModel: () => ({}) }, listen, now: c.now })
    await flush()
    expect(calls[0]).toMatchObject({ stream, gate: false, maxMs: 6000 })
    // Vosk закрыл первый заход на паузе (1,0 с): слова первого захода — от его первого звука
    c.set(1000)
    sessions[0].cb.onResult("i'm trying", { audioStartMs: 100, words: [w("i'm", 0.1, 0.4), w('trying', 0.5, 1.0)] })
    await flush()
    expect(sessions).toHaveLength(2) // следующий заход начался сразу
    // второй заход стартовал в 1000 мс, первый звук в нём — через 200 мс → слова сдвигаются на 1,2 с
    c.set(2500)
    sessions[1].cb.onResult('to learn', { audioStartMs: 200, words: [w('to', 0.1, 0.2), w('learn', 0.2, 0.7)] })
    await flush()
    t.stop()
    const r = await t.done
    expect(r.ok).toBe(true)
    expect(r.words.map(x => [x.word, Math.round(x.start * 1000) / 1000, Math.round(x.end * 1000) / 1000])).toEqual([["i'm", 0.2, 0.5], ['trying', 0.6, 1.1], ['to', 1.3, 1.4], ['learn', 1.4, 1.9]])
    expect(r.text).toBe("i'm trying to learn")
  })
  it('stop(): просим итог текущего захода; если итог не пришёл — отдаём что есть по таймеру', async () => {
    const c = clock()
    let fire = null
    const h = { stop: vi.fn(), cancel: vi.fn() }
    const t = listenTake({ chunks: CHUNKS, stream: {}, runtime: { getModel: () => ({}) }, listen: async () => h, now: c.now, setTimer: fn => { fire = fn; return 1 }, clearTimer: () => {} })
    await flush()
    t.stop()
    expect(h.stop).toHaveBeenCalled()
    fire()
    expect(h.cancel).toHaveBeenCalled()
    expect(await t.done).toMatchObject({ ok: true, words: [] })
  })
  it('микрофон не открылся / ошибка движка — ok false с причиной', async () => {
    const r1 = await listenTake({ chunks: CHUNKS, stream: {}, runtime: { getModel: () => ({}) }, listen: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) } }).done
    expect(r1).toMatchObject({ ok: false, reason: 'NotAllowedError' })
    let cb
    const t = listenTake({ chunks: CHUNKS, stream: {}, runtime: { getModel: () => ({}) }, listen: async (m, g, c) => { cb = c; return { stop() {}, cancel() {} } } })
    await flush()
    cb.onError('acceptWaveform: boom')
    expect(await t.done).toMatchObject({ ok: false, reason: 'acceptWaveform: boom' })
  })
})

describe('dictorFromLibrary: диктор из кусков библиотеки', () => {
  const lib = new Map([["i'm", { url: 'a.mp3', duration: 0.4 }], ['trying', { url: 'b.mp3', duration: 0.6 }], ['to learn', { url: 'c.mp3', duration: 0.7 }]])
  it('слова с таймингами и play(): файлы включаются по плану, play резолвится после последнего куска', async () => {
    const timers = []
    const played = []
    const d = dictorFromLibrary(CHUNKS, { cache: lib, play: key => { played.push(key); return true }, say: () => { throw new Error('системный голос не нужен') }, setTimer: (fn, ms) => { timers.push({ fn, ms }); return 1 } })
    expect(d.words.map(x => x.word)).toEqual(["I'm", 'trying', 'to', 'learn'])
    expect(d.durationMs).toBe(400 + 80 + 600 + 80 + 700)
    const p = d.play()
    expect(timers.map(t => t.ms)).toEqual([0, 480, 1160, d.leadMs + d.durationMs + 250])
    timers.slice(0, 3).forEach(t => t.fn())
    expect(played).toEqual(["i'm", 'trying', 'to learn'])
    let resolved = false
    p.then(() => { resolved = true })
    timers[3].fn()
    await p
    expect(resolved).toBe(true)
  })
  it('куска нет в слотах — голос системы', () => {
    const said = []
    const timers = []
    const d = dictorFromLibrary(['hello'], { cache: new Map(), play: () => false, say: t => said.push(t), setTimer: (fn, ms) => { timers.push({ fn, ms }) } })
    d.play()
    timers[0].fn()
    expect(said).toEqual(['hello'])
  })
  it('libraryRms: среднее по файлам кусков; сбой — null', async () => {
    const rms = await libraryRms(CHUNKS, { cache: lib, load: async url => url, analyze: async url => ({ rms: url === 'a.mp3' ? 0.1 : url === 'b.mp3' ? 0.2 : 0.3 }) })
    expect(rms).toBeCloseTo(0.2, 5)
    expect(await libraryRms(CHUNKS, { cache: lib, load: async () => { throw new Error('offline') } })).toBeNull()
    expect(await libraryRms(CHUNKS, { cache: new Map() })).toBeNull()
  })
})
