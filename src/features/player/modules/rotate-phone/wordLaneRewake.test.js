import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prepareWords, playWordSlot, rewakeClips, releaseClips, hasWordSlot } from './wordLaneClips.js'
import { prepareTrack, playTrack, rewakeTrack, stopVoice } from './wordLaneVoice.js'

// Слоты диктора и запись автора после прерывания аудиосессии (iPhone): прежние элементы мертвы, заново будятся тишиной в жесте и получают уже загруженный звук
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
let created
class FakeAudio {
  constructor(src) { this.history = [src]; this._src = src; this.played = 0; this.paused = 0; this.loads = 0; this.currentTime = 0; created.push(this) }
  get src() { return this._src }
  set src(v) { this._src = v; this.history.push(v) }
  setAttribute() {}
  removeAttribute() { this._src = '' }
  play() { this.played += 1; return Promise.resolve() }
  pause() { this.paused += 1 }
  load() { this.loads += 1 }
}
beforeEach(() => { created = []; vi.stubGlobal('Audio', FakeAudio) })
afterEach(() => { releaseClips(); stopVoice(); vi.unstubAllGlobals() })

describe('rewakeClips: слоты слов диктора и кота заново', () => {
  it('каждый слот получает свежий элемент: тишина (play → pause) в жесте, затем прежний звук (blob слова) — без новой загрузки из сети', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    vi.stubGlobal('fetch', fetchMock)
    await prepareWords([{ key: "i'm", url: 'https://r2/a.mp3' }, { key: 'trying', url: 'https://r2/b.mp3' }])
    await flush()
    const first = created.slice()
    const urlOfIm = first[0].history.at(-1)
    expect(urlOfIm).toMatch(/^blob:/) // слово загружено в память
    fetchMock.mockClear()
    created.length = 0

    expect(rewakeClips()).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled() // сеть не трогаем
    expect(created).toHaveLength(2)
    first.forEach(old => { expect(old.src).toBe('') }) // прежние элементы мертвы — выгружены
    created.forEach(a => { expect(a.played).toBe(1); expect(a.history[0]).toMatch(/^blob:/) }) // тишина в жесте
    await flush()
    created.forEach(a => { expect(a.paused).toBe(1); expect(a.loads).toBe(1) })
    expect(created[0].history.at(-1)).toBe(urlOfIm) // настоящий звук вернулся в новый элемент
    expect(hasWordSlot("i'm")).toBe(true)
    expect(playWordSlot("i'm")).toBe(true) // играет новый элемент
    expect(created[0].currentTime).toBe(0)
    expect(first[0].played).toBe(1) // прежний при rewake не играл и не играет
  })

  it('звук слова загрузился ПОСЛЕ повторного прогрева — подставляется в уже новый элемент', async () => {
    let resolve
    vi.stubGlobal('fetch', () => new Promise(r => { resolve = r }))
    const ready = prepareWords([{ key: 'try', url: 'https://r2/t.mp3' }])
    created.length = 0
    expect(rewakeClips()).toBe(1)
    const fresh = created[0]
    resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
    await ready
    await flush()
    expect(fresh.history.at(-1)).toMatch(/^blob:/)
  })

  it('без слотов (игра не начата / уже закрыта) — 0 и тихо', () => {
    expect(rewakeClips()).toBe(0)
  })
})

describe('rewakeTrack: запись автора', () => {
  it('готовили запись — после прерывания элемент готовится заново (тишина, затем файл); не готовили — ничего', async () => {
    rewakeTrack()
    expect(created).toHaveLength(0)
    prepareTrack('https://r2/voice.mp3')
    await flush()
    expect(created).toHaveLength(1)
    expect(created[0].history.at(-1)).toBe('https://r2/voice.mp3')
    rewakeTrack()
    expect(created).toHaveLength(2)
    expect(created[0].src).toBe('') // прежний выгружен
    await flush()
    expect(created[1].history.at(-1)).toBe('https://r2/voice.mp3')
    expect(playTrack('https://r2/voice.mp3')).toBe(created[1])
  })
})
