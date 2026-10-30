import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sliceToWav, monoOf, spanKey, prepareClips, prepareWords, playClip, playWordSlot, hasWordSlot, wordSlotInfo, rewakeClips, releaseClips, clipsState, FADE_IN_S } from './wordLaneClips.js'

const ascii = (u8, o, n) => String.fromCharCode(...u8.slice(o, o + n))
const view = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength)

describe('нарезка клипа в WAV', () => {
  const rate = 8000
  const samples = Float32Array.from({ length: rate * 2 }, (_, i) => Math.sin(i / 20) * 0.8)    // 2 секунды
  it('заголовок WAV, моно, 16 бит, длина — по отрезку', () => {
    const w = sliceToWav(samples, rate, 0.5, 1.0)
    expect(ascii(w, 0, 4)).toBe('RIFF'); expect(ascii(w, 8, 4)).toBe('WAVE'); expect(ascii(w, 36, 4)).toBe('data')
    const v = view(w)
    expect(v.getUint16(22, true)).toBe(1); expect(v.getUint32(24, true)).toBe(rate); expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(0.5 * rate * 2)
    expect(w.length).toBe(44 + 0.5 * rate * 2)
  })
  it('края сглажены (начало и конец тихие), середина — громкая; отрезок за концом файла обрезается', () => {
    const w = sliceToWav(samples, rate, 0.2, 0.7)
    const v = view(w)
    expect(Math.abs(v.getInt16(44, true))).toBeLessThan(500)
    const n = v.getUint32(40, true) / 2
    expect(Math.abs(v.getInt16(44 + (n - 1) * 2, true))).toBeLessThan(500)
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v.getInt16(44 + i * 2, true)))
    expect(peak).toBeGreaterThan(20000)
    expect(FADE_IN_S).toBeGreaterThan(0)
    expect(view(sliceToWav(samples, rate, 1.9, 5)).getUint32(40, true)).toBe(Math.round(0.1 * rate) * 2)
    expect(view(sliceToWav(samples, rate, 5, 6)).getUint32(40, true)).toBe(0)
  })
  it('моно из стерео — среднее каналов; ключ отрезка', () => {
    const buf = { numberOfChannels: 2, length: 3, getChannelData: c => (c ? Float32Array.of(0, 1, -1) : Float32Array.of(1, 1, 1)) }
    expect(Array.from(monoOf(buf))).toEqual([0.5, 1, 0])
    expect(spanKey({ start: 0.14, end: 1.1 })).toBe('0.140-1.100')
  })
})

describe('клипы диктора на элементах <audio>', () => {
  let created
  beforeEach(() => {
    created = []
    vi.stubGlobal('Audio', class { constructor(src) { this.src = src; this.paused = true; created.push(this) } setAttribute() {} play() { this.paused = false; this.played = (this.played ?? 0) + 1; return Promise.resolve() } pause() { this.paused = true } load() {} removeAttribute() { this.src = '' } })
    vi.stubGlobal('URL', { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL() {} })
  })
  afterEach(() => { releaseClips(); vi.unstubAllGlobals() })

  it('в тапе создаётся по элементу на отрезок и все «будятся» (play внутри жеста); повторяющиеся отрезки — один элемент', () => {
    vi.stubGlobal('window', { OfflineAudioContext: undefined })
    prepareClips('blob:x', [{ start: 0.1, end: 0.5 }, { start: 0.1, end: 0.5 }, { start: 0.7, end: 1.2 }])
    expect(created).toHaveLength(2)
    expect(created.every(a => a.played === 1)).toBe(true)
  })
  it('нет поддержки декодирования — готово: false, клип не играет (вызывающий идёт запасным путём)', async () => {
    vi.stubGlobal('window', { OfflineAudioContext: undefined })
    expect(await prepareClips('blob:x', [{ start: 0, end: 1 }])).toBe(false)
    expect(clipsState()).toBe('failed')
    expect(playClip({ start: 0, end: 1 })).toBe(false)
  })
  it('декодирование удалось: клипы нарезаны, играют с нуля; неизвестный отрезок — false', async () => {
    const data = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10))
    vi.stubGlobal('window', { OfflineAudioContext: class { decodeAudioData() { return Promise.resolve({ numberOfChannels: 1, length: data.length, sampleRate: 8000, duration: 2, getChannelData: () => data }) } } })
    vi.stubGlobal('fetch', () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
    const span = { start: 0.2, end: 0.8 }
    expect(await prepareClips('blob:x', [span])).toBe(true)
    expect(clipsState()).toBe('ready')
    await Promise.resolve()
    expect(playClip(span)).toBe(true)
    const a = created[0]
    expect(a.currentTime).toBe(0)
    expect(a.muted).toBe(false)
    expect(playClip({ start: 9, end: 10 })).toBe(false)
  })

  it('куски из библиотеки слов: слот на каждый файл, «разбужен» в жесте; после загрузки играет с нуля; неизвестный ключ — false', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    const ready = prepareWords([{ key: "i'm", url: 'https://r2/a.mp3' }, { key: 'trying', url: 'https://r2/b.mp3' }])
    expect(created).toHaveLength(2)
    expect(created.every(a => a.played === 1)).toBe(true)
    expect(await ready).toBe(true)
    await Promise.resolve()
    expect(hasWordSlot("i'm")).toBe(true)
    expect(playWordSlot("i'm")).toBe(true)
    expect(created[0].currentTime).toBe(0)
    expect(playWordSlot('nope')).toBe(false)
  })
  it('файл библиотеки не скачался (CORS) — слот играет по прямой ссылке', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('cors')))
    await prepareWords([{ key: 'try', url: 'https://r2/t.mp3' }])
    expect(playWordSlot('try')).toBe(true)
    expect(created[0].src).toBe('https://r2/t.mp3')
  })
  it('диагностика слота (wordSlotInfo): разбужен тишиной и звук подставлен — prepared, readyState виден; слота нет — exists: false', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    expect(wordSlotInfo('nope')).toMatchObject({ exists: false, prepared: false })
    const ready = prepareWords([{ key: 'line:rh_start', url: 'https://r2/rh.mp3' }])
    expect(wordSlotInfo('line:rh_start')).toMatchObject({ exists: true, hasUrl: false, prepared: false }) // файл ещё качается
    await ready
    await Promise.resolve()
    const info = wordSlotInfo('line:rh_start')
    expect(info).toMatchObject({ exists: true, hasUrl: true, prepared: true, wokeErr: null })
    expect(info.wokeAt).toBeGreaterThan(0)
  })
  it('play() тишины отклонён (жеста нет — NotAllowedError): слот НЕ разбужен — prepared false и wokeErr с именем ошибки; повторное пробуждение в жесте это исправляет', async () => {
    let allowed = false
    vi.stubGlobal('Audio', class { constructor(src) { this.src = src; this.paused = true; created.push(this) } setAttribute() {} play() { return allowed ? Promise.resolve() : Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) } pause() {} load() {} removeAttribute() {} })
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    await prepareWords([{ key: 'line:a', url: 'https://r2/a.mp3' }])
    await Promise.resolve()
    expect(wordSlotInfo('line:a')).toMatchObject({ hasUrl: true, prepared: false, wokeErr: 'NotAllowedError', wokeAt: 0 })
    allowed = true
    rewakeClips()
    await new Promise(r => setTimeout(r, 0))
    expect(wordSlotInfo('line:a')).toMatchObject({ prepared: true, wokeErr: null })
  })
  it('playWordSlot(key, onResult): исход play() приходит в onResult (ok / rejected); возвращаемое значение прежнее', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    await prepareWords([{ key: 'try', url: 'https://r2/t.mp3' }])
    await Promise.resolve()
    const out = vi.fn()
    expect(playWordSlot('try', out)).toBe(true)
    await Promise.resolve(); await Promise.resolve()
    expect(out).toHaveBeenCalledWith(expect.objectContaining({ play: 'ok' }))
    created[0].play = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    const bad = vi.fn()
    expect(playWordSlot('try', bad)).toBe(true)
    await Promise.resolve(); await Promise.resolve()
    expect(bad).toHaveBeenCalledWith(expect.objectContaining({ play: 'rejected', error: 'NotAllowedError' }))
    expect(playWordSlot('nope', bad)).toBe(false)
  })
})
