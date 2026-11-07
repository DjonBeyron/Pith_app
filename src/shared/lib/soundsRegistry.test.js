import { describe, it, expect, vi } from 'vitest'

// Контекст звуков интерфейса — в реестре страницы (audioContextRegistry.js): обновление сессии закрывает его вместе со всеми; sounds.js забывает ссылку и кэш элементов, новый — лениво, при следующем preloadSounds
const created = []
class FakeAudio { constructor(src) { this.src = src; this.currentTime = 0; this.paused = true; created.push(this) } play() { return Promise.resolve() } pause() {} load() {} addEventListener() {} removeEventListener() {} }
const ctxs = []
class FakeCtx { constructor() { this.state = 'suspended'; ctxs.push(this); this.close = vi.fn(() => { this.state = 'closed'; return Promise.resolve() }) } resume() { this.state = 'running'; return Promise.resolve() } suspend() { return Promise.resolve() } }
globalThis.Audio = FakeAudio
globalThis.window = { AudioContext: FakeCtx }
globalThis.document = { documentElement: { classList: { toggle() {} } }, addEventListener() {}, removeEventListener() {} }
const { preloadSounds, soundCtxState, playSound } = await import('./sounds.js')
const { liveContexts, closeAll } = await import('./audioContextRegistry.js')
const { gameCtxState, getGameCtx } = await import('./gameAudioCtx.js')

describe('sounds.js и реестр контекстов', () => {
  it('preloadSounds создаёт контекст вида sounds; closeAll закрывает его, sounds.js его забывает и выбрасывает кэш; следующий preloadSounds — новый контекст', async () => {
    preloadSounds()
    expect(liveContexts().map(r => r.kind)).toEqual(['sounds'])
    const first = ctxs[0], n = created.length
    const r = await closeAll()
    expect(r.kinds).toEqual(['sounds']); expect(first.close).toHaveBeenCalled()
    expect(soundCtxState()).toBeNull() // ссылки нет: playSound играет <audio>, без контекста
    playSound('message-in'); expect(created.length).toBe(n + 1) // кэш выброшен — элемент новый
    preloadSounds()
    expect(ctxs).toHaveLength(2); expect(soundCtxState()).toBe('suspended')
    expect(liveContexts().map(r => r.kind)).toEqual(['sounds'])
  })
  it('игровой контекст тоже в реестре: closeAll обнуляет ссылку, getGameCtx создаёт новый', async () => {
    globalThis.AudioContext = FakeCtx
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
    const g = getGameCtx()
    expect(liveContexts().map(r => r.kind)).toEqual(['sounds', 'game'])
    await closeAll({ only: 'game' })
    expect(g.close).toHaveBeenCalled(); expect(gameCtxState()).toBeNull()
    expect(getGameCtx()).not.toBe(g)
  })
})
