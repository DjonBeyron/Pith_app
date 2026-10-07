import { describe, it, expect, beforeEach, vi } from 'vitest'

// Кэш звуков: элемент не выбрасывается по отказу/долгому старту play() (v3.2.1857),
// а после прерывания аудиосессии пересоздаётся в жесте
const created = []
let playImpl = () => Promise.resolve()
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; this.paused = true; created.push(this) }
  play() { return playImpl(this) }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
let lastCtx = null
class FakeCtx {
  constructor() { this.state = 'suspended'; lastCtx = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { return Promise.resolve() }
}
const handlers = {}
globalThis.Audio = FakeAudio
globalThis.window = { AudioContext: FakeCtx }
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  addEventListener: (t, fn) => { handlers[t] = fn },
  removeEventListener: t => { delete handlers[t] },
}
const { playSound, preloadSounds } = await import('./sounds.js')
const { lessonOpened } = await import('./lessonOpen.js')

beforeEach(() => { vi.useFakeTimers(); created.length = 0; playImpl = () => Promise.resolve() })

describe('кэш звуков не теряет прогретый элемент', () => {
  it('медленный старт (play() грузит файл дольше 1,5 с) — тот же элемент, новый не создаётся', async () => {
    preloadSounds()
    const n = created.length
    playImpl = () => new Promise(res => setTimeout(res, 4000))
    playSound('message-in')
    vi.advanceTimersByTime(3000)
    playSound('message-in')
    expect(created).toHaveLength(n)
  })

  it('отказ play() (NotAllowedError) — элемент остаётся в кэше', async () => {
    preloadSounds()
    const n = created.length
    playImpl = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    playSound('answer-correct')
    await Promise.resolve(); await Promise.resolve()
    playSound('answer-correct')
    expect(created).toHaveLength(n)
  })
})

describe('прерывание аудиосессии iOS', () => {
  it('на ближайшем касании в уроке элементы пересоздаются в жесте', () => {
    preloadSounds()
    lessonOpened()
    lastCtx.state = 'interrupted'
    lastCtx.onstatechange()
    playSound('message-in') // кэш пуст — запасной элемент вне жеста
    const before = created.length
    handlers.pointerdown() // жест
    const fresh = created.slice(before)
    expect(fresh.map(a => a.src.split('?')[0]).sort()).toContain('/sounds/message-in.mp3')
    expect(fresh.length).toBe(9) // весь набор, в том числе заменён запасной message-in
  })
})
