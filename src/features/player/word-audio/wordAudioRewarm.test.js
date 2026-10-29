import { describe, it, expect, vi, beforeEach } from 'vitest'

// Слова урока после прерывания аудиосессии (iPhone): элементы сбрасываются (причина в журнале), а игра заново прогревает их в жесте (rewarmWordElements) — первые слова диктора не молчат
const logs = vi.hoisted(() => [])
const handlers = vi.hoisted(() => [])
vi.mock('../../../shared/lib/debug.js', () => ({ pLog: m => logs.push(m) }))
vi.mock('../../../shared/lib/sounds.js', () => ({
  onAudioInterrupted: cb => { handlers.push(cb); return () => { const i = handlers.indexOf(cb); if (i >= 0) handlers.splice(i, 1) } },
  soundCtxState: () => 'running', unlockAudio: () => {},
}))
vi.mock('../../../shared/lib/wordAudio/wordAudioApi.js', () => ({
  cachedWordAudio: () => new Map([['keep', { url: 'https://audio.test/keep.mp3' }], ['try', { url: 'https://audio.test/try.mp3' }]]),
}))

const made = []
class FakeAudio {
  constructor(src) { this.history = [src]; this._src = src; this.plays = 0; this.pauses = 0; this.loads = 0; made.push(this) }
  get src() { return this._src }
  set src(v) { this._src = v; this.history.push(v) }
  removeAttribute() { this._src = '' }
  play() { this.plays += 1; return Promise.resolve() }
  pause() { this.pauses += 1 }
  load() { this.loads += 1 }
}
globalThis.Audio = FakeAudio
globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }))

const { preloadWordAudio, playWord, rewarmWordElements, dropWordElements, releaseWordAudio } = await import('./wordAudioPlayer.js')
const { gameAudioWarm } = await import('../../../shared/lib/gameAudioWarm.js')
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

beforeEach(() => { releaseWordAudio(); gameAudioWarm.end(); logs.length = 0; made.length = 0 })

describe('сброс элементов слов по прерыванию: причина в журнале', () => {
  it('чужое прерывание (звонок, наушники): «прерывание аудиосессии»; наше (после begin игры) — с пометкой про открытие микрофона', async () => {
    await preloadWordAudio(['keep'])
    handlers.forEach(cb => cb())
    expect(logs.find(m => m.includes('сброшены'))).toContain('(прерывание аудиосессии)')
    expect(logs.find(m => m.includes('сброшены'))).not.toContain('микрофона игры')
    logs.length = 0
    gameAudioWarm.begin()
    handlers.forEach(cb => cb())
    expect(logs.find(m => m.includes('сброшены'))).toContain('вызванное открытием микрофона игры')
    gameAudioWarm.end()
  })

  it('возврат из фона и вызов без причины пишут свою причину; элементы выбрасываются (pause + src снят)', async () => {
    await preloadWordAudio(['keep'])
    const el = made.at(-1)
    dropWordElements('возврат из фона')
    expect(logs.at(-1)).toContain('(возврат из фона)')
    expect(el.pauses).toBeGreaterThan(0)
    expect(el.src).toBe('')
  })
})

describe('rewarmWordElements: слова урока заново в жесте', () => {
  it('после сброса: на каждое прогретое слово новый элемент — сначала тишина (play → pause), потом blob и load; тап играет прогретый элемент без пересоздания', async () => {
    await preloadWordAudio(['keep', 'try'])
    const blobOfKeep = made.find(a => a.history[0].startsWith('blob:')).history[0]
    handlers.forEach(cb => cb()) // прерывание: элементы сброшены
    made.length = 0
    logs.length = 0
    expect(rewarmWordElements()).toBe(2)
    expect(made).toHaveLength(2)
    made.forEach(a => { expect(a.history[0]).toMatch(/^blob:/); expect(a.plays).toBe(1) }) // тишина (blob wav), play в жесте
    await flush()
    made.forEach(a => { expect(a.pauses).toBe(1); expect(a.loads).toBe(1); expect(a.history).toHaveLength(2) }) // после пробуждения подставлен настоящий blob слова
    expect(made.map(a => a.history[1])).toContain(blobOfKeep)
    expect(logs.some(m => m.includes('слова прогреты заново: 2'))).toBe(true)
    logs.length = 0
    const onWait = vi.fn()
    expect(playWord('keep', { onWait })).toBe(true)
    expect(logs.some(m => m.includes('пересоздан'))).toBe(false) // элемент уже есть — тап не создаёт его вне прогрева
    expect(made).toHaveLength(2)
  })

  it('слова, которые не успели прогреться (нет в списке warm), не создаются; без прогретых слов — 0', () => {
    expect(rewarmWordElements()).toBe(0)
  })

  it('слово, у которого blob не вышел (CORS), прогревается по прямой ссылке', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('cors'))
    await preloadWordAudio(['keep'])
    handlers.forEach(cb => cb())
    made.length = 0
    expect(rewarmWordElements()).toBe(1)
    await flush()
    expect(made[0].history.at(-1)).toBe('https://audio.test/keep.mp3')
  })
})
