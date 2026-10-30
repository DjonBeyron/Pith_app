import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchBlob, measureSpeech, prefetchWords, dropFetched, speechOfUrl, MEASURE_PARALLEL } from './wordLaneFetch.js'
import { prepareWords, releaseClips, hasWordSlot } from './wordLaneClips.js'

// Скачивание и измерение озвучки до создания слотов: файл качается один раз, замеры идут по очереди (не больше MEASURE_PARALLEL), prefetch в тапе и prepareWords после settle не дублируют работу
const fileOf = (n = 8000) => ({ numberOfChannels: 1, length: n, sampleRate: 8000, duration: n / 8000, getChannelData: () => Float32Array.from({ length: n }, (_, i) => (i > 800 && i < 4000 ? Math.sin(i / 10) : 0)) })
let fetches, decoding, maxDecoding, created
const okFetch = url => { fetches.push(url); return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }) }
beforeEach(() => {
  fetches = []; decoding = 0; maxDecoding = 0; created = []
  vi.stubGlobal('fetch', okFetch)
  vi.stubGlobal('window', { OfflineAudioContext: class { decodeAudioData() { decoding++; maxDecoding = Math.max(maxDecoding, decoding); return new Promise(r => setTimeout(() => { decoding--; r(fileOf()) }, 5)) } } })
  vi.stubGlobal('Audio', class { constructor(src) { this.src = src; this.paused = true; created.push(this) } setAttribute() {} play() { this.paused = false; return Promise.resolve() } pause() { this.paused = true } removeAttribute() {} load() {} })
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL() {} })
  Blob.prototype.arrayBuffer ??= () => Promise.resolve(new ArrayBuffer(8))
})
afterEach(() => { releaseClips(); vi.unstubAllGlobals() })
const items = n => Array.from({ length: n }, (_, i) => ({ key: `w${i}`, url: `https://r2/w${i}-${Math.random()}.mp3` }))

describe('fetchBlob', () => {
  it('один адрес — одна загрузка: второй вызов получает тот же промис', async () => {
    const a = fetchBlob('https://r2/one.mp3'), b = fetchBlob('https://r2/one.mp3')
    expect(a).toBe(b)
    await a
    expect(fetches).toEqual(['https://r2/one.mp3'])
  })
  it('не скачалось: отказ, запись забыта — следующий вызов пробует заново', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('net')))
    await expect(fetchBlob('https://r2/bad.mp3')).rejects.toThrow('net')
    vi.stubGlobal('fetch', okFetch)
    await expect(fetchBlob('https://r2/bad.mp3')).resolves.toBeInstanceOf(Blob)
  })
  it('http 404 — тоже отказ', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }))
    await expect(fetchBlob('https://r2/404.mp3')).rejects.toThrow('404')
  })
  it('dropFetched отпускает скачанное: адрес качается заново', async () => {
    await fetchBlob('https://r2/drop.mp3'); dropFetched(); await fetchBlob('https://r2/drop.mp3')
    expect(fetches).toHaveLength(2)
  })
})

describe('measureSpeech: очередь замеров', () => {
  it('30 файлов измеряются не больше MEASURE_PARALLEL разом (основной поток не занят секундами подряд)', async () => {
    const list = items(30)
    await prefetchWords(list)
    expect(maxDecoding).toBeLessThanOrEqual(MEASURE_PARALLEL)
    expect(maxDecoding).toBeGreaterThan(0)
    for (const it of list) expect(speechOfUrl(it.url)).toMatchObject({ lead: expect.any(Number), ms: expect.any(Number) })
  })
  it('один файл измеряется один раз, сколько бы раз ни просили', async () => {
    const url = 'https://r2/twice.mp3'
    const blob = await fetchBlob(url)
    await Promise.all([measureSpeech(url, blob), measureSpeech(url, blob)])
    await measureSpeech(url, blob)
    expect(speechOfUrl(url)).not.toBeNull()
    expect(decoding).toBe(0)
  })
})

describe('prefetchWords + prepareWords', () => {
  it('prefetch в тапе (до слотов), потом prepareWords: файлы качаются по одному разу, слоты получают звук', async () => {
    const list = items(4)
    const pre = prefetchWords(list)          // тап: сети ещё ничего не мешает, <audio> нет
    expect(created).toHaveLength(0)
    const ready = prepareWords(list)         // после settle: слоты создаются и будятся
    expect(created).toHaveLength(4)
    await pre
    expect(await ready).toBe(true)
    expect(fetches).toHaveLength(4)
    for (const it of list) expect(hasWordSlot(it.key)).toBe(true)
  })
  it('prefetch никогда не отклоняется: плохой адрес пропущен, остальные скачаны', async () => {
    vi.stubGlobal('fetch', url => (/bad/.test(url) ? Promise.reject(new Error('x')) : okFetch(url)))
    await expect(prefetchWords([{ key: 'a', url: 'https://r2/bad.mp3' }, { key: 'b', url: 'https://r2/good-b.mp3' }])).resolves.toBeUndefined()
    expect(fetches).toEqual(['https://r2/good-b.mp3'])
  })
  it('пустой список и среда без fetch — сразу готово', async () => {
    await expect(prefetchWords([])).resolves.toBeUndefined()
    vi.stubGlobal('fetch', undefined)
    await expect(prefetchWords(items(2))).resolves.toBeUndefined()
  })
  it('after: фоновые файлы не качаются, пока не готовы нужные к старту; слоты у всех созданы сразу (в жесте)', async () => {
    const now = items(2), late = items(3)
    let release
    const gate = new Promise(r => { release = r })
    const lateReady = prepareWords(late, { after: gate })
    expect(created).toHaveLength(3)          // слоты фоновых разбужены в том же тапе
    await new Promise(r => setTimeout(r, 20))
    expect(fetches).toHaveLength(0)          // но сеть ждёт
    release()
    expect(await lateReady).toBe(true)
    expect(fetches).toHaveLength(3)
    expect(now).toHaveLength(2)
  })
  it('releaseClips (конец игры, даже без слотов — микрофон не дали) отпускает и скачанное заранее', async () => {
    const list = items(2)
    await prefetchWords(list)
    expect(fetches).toHaveLength(2)
    releaseClips()
    await prefetchWords(list)
    expect(fetches).toHaveLength(4)
  })
})
