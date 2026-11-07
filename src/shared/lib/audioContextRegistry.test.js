import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTracked, forget, liveContexts, closeAll, describe as describeCtxs, ageText, resetRegistry } from './audioContextRegistry.js'

// Реестр всех AudioContext страницы: создание с видом и временем, закрытие всех (владельцам — onClose сразу), ожидание close(), строка для журнала
let t = 0
class Ctx {
  constructor(o) { this.opts = o; this.state = 'running'; this.close = vi.fn(() => { this.state = 'closed'; return Promise.resolve() }) }
}
beforeEach(() => { t = 0; resetRegistry({ now: () => t }) })

describe('audioContextRegistry', () => {
  it('createTracked: создаёт через Ctor (opts передаются), пишет вид и время; закрытые выпадают; forget убирает', () => {
    const a = createTracked('game', undefined, { Ctor: Ctx })
    t = 5000
    const b = createTracked('capture', { sampleRate: 16000 }, { Ctor: Ctx })
    expect(a.opts).toBeUndefined(); expect(b.opts).toEqual({ sampleRate: 16000 })
    expect(liveContexts().map(r => [r.kind, r.state, r.createdAt])).toEqual([['game', 'running', 0], ['capture', 'running', 5000]])
    b.state = 'closed'
    expect(liveContexts().map(r => r.kind)).toEqual(['game'])
    forget(a)
    expect(liveContexts()).toEqual([])
  })
  it('нет Web Audio — бросает, как new AudioContext', () => {
    expect(() => createTracked('game', undefined, { Ctor: null })).toThrow(/нет AudioContext/)
  })
  it('closeAll: onClose каждому владельцу СИНХРОННО, close() у всех, промис — после закрытия; реестр пуст', async () => {
    const seen = []
    const a = createTracked('game', undefined, { Ctor: Ctx, onClose: c => seen.push(['game', c.state]) })
    const b = createTracked('sounds', undefined, { Ctor: Ctx, onClose: () => seen.push(['sounds']) })
    const p = closeAll()
    expect(seen).toEqual([['game', 'running'], ['sounds']])
    expect(a.close).toHaveBeenCalled(); expect(b.close).toHaveBeenCalled()
    expect(await p).toMatchObject({ closed: 2, kinds: ['game', 'sounds'], timedOut: 0 })
    expect(liveContexts()).toEqual([])
  })
  it('only / except: закрывает выборочно', async () => {
    createTracked('game', undefined, { Ctor: Ctx }); createTracked('capture', undefined, { Ctor: Ctx }); createTracked('sounds', undefined, { Ctor: Ctx })
    expect((await closeAll({ only: 'capture' })).kinds).toEqual(['capture'])
    expect((await closeAll({ except: ['sounds'] })).kinds).toEqual(['game'])
    expect((await closeAll({ except: r => r.kind === 'sounds' })).closed).toBe(0)
    expect(liveContexts().map(r => r.kind)).toEqual(['sounds'])
  })
  it('close() висит (iOS, прерванный контекст) — не ждём дольше waitMs; следующий closeAll ждёт и начатые раньше', async () => {
    vi.useFakeTimers()
    let release
    class Hang { constructor() { this.state = 'interrupted'; this.close = () => new Promise(r => { release = r }) } }
    createTracked('sounds', undefined, { Ctor: Hang })
    const first = closeAll({ waitMs: 500 })
    createTracked('game', undefined, { Ctor: Ctx })
    let secondDone = false
    const second = closeAll({ waitMs: 500 }).then(r => { secondDone = true; return r })
    await vi.advanceTimersByTimeAsync(100)
    expect(secondDone).toBe(false) // ждёт close() первого
    await vi.advanceTimersByTimeAsync(500)
    expect((await first).timedOut).toBe(1)
    expect(await second).toMatchObject({ closed: 1, kinds: ['game'] })
    release?.(); vi.useRealTimers()
  })
  it('бросающий close() и onClose не ломают закрытие остальных', async () => {
    class Bad { constructor() { this.state = 'running'; this.close = () => { throw new Error('x') } } }
    createTracked('level', undefined, { Ctor: Bad, onClose: () => { throw new Error('y') } })
    const ok = createTracked('game', undefined, { Ctor: Ctx })
    expect((await closeAll()).closed).toBe(2); expect(ok.close).toHaveBeenCalled()
  })
  it('describe: виды с состоянием и возрастом, одинаковые — ×N; пусто — «нет контекстов»', () => {
    expect(describeCtxs()).toBe('нет контекстов')
    createTracked('sounds', undefined, { Ctor: Ctx })
    t = 29 * 60000
    const c1 = createTracked('capture', undefined, { Ctor: Ctx }); c1.state = 'interrupted'
    const c2 = createTracked('capture', undefined, { Ctor: Ctx }); c2.state = 'interrupted'
    t += 12000
    createTracked('game', undefined, { Ctor: Ctx })
    t += 0
    expect(describeCtxs()).toBe('sounds running 29 мин, capture×2 interrupted 12 с, game running 0 с')
    expect(ageText(2 * 3600e3)).toBe('2 ч')
  })
})
