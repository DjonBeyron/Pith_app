import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { armOutputCheck, CHECK_MS, WATCH_MS } from './gameAudioOutputCheck.js'
import { playGameBuffer, watchNextStart, stopGameBuffers } from './gameBufferPlay.js'
import { closeGameCtx } from './gameAudioCtx.js'
import { makeFakeWebAudio } from './fakeWebAudio.js'

// Проверка вывода после обновления сессии: время контекста у первой реплики должно идти, короткая — доиграть; нет — ОДИН повтор renew и перезапуск реплики
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
let watcher, log
const watch = fn => { watcher = fn; return () => { watcher = null } }
const info = (over = {}) => ({ ctx: { currentTime: 1, state: 'running' }, t0: 1, durMs: 3000, ended: () => false, replay: vi.fn(), ...over })
beforeEach(() => { vi.useFakeTimers(); watcher = null; log = vi.fn() })
afterEach(() => { vi.useRealTimers(); stopGameBuffers(); closeGameCtx(); vi.unstubAllGlobals() })

describe('armOutputCheck', () => {
  it('время контекста стоит 1,5 с после старта первой реплики → «звук не пошёл — повторяю обновление сессии», renew, перезапуск реплики', async () => {
    const renew = vi.fn(async () => ({ state: 'running' }))
    armOutputCheck({ renew, watch, live: () => [], log })
    const i = info()
    watcher(i)
    await vi.advanceTimersByTimeAsync(CHECK_MS - 1)
    expect(renew).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(log.mock.calls.map(c => c[0])).toContain('[audio] звук не пошёл (время ctx стоит 1500 мс (running)) — повторяю обновление сессии')
    expect(renew).toHaveBeenCalledTimes(1); expect(i.replay).toHaveBeenCalledTimes(1)
  })
  it('время идёт — повтора нет, в журнале «первая реплика идёт»', async () => {
    const renew = vi.fn()
    armOutputCheck({ renew, watch, live: () => [], log })
    const i = info(); watcher(i); i.ctx.currentTime = 2.4
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    expect(renew).not.toHaveBeenCalled(); expect(log.mock.calls[0][0]).toMatch(/первая реплика идёт — время ctx \+1\.40 с/)
  })
  it('короткая реплика: время идёт, но ended не пришёл за длину + запас → повтор', async () => {
    const renew = vi.fn(async () => null)
    armOutputCheck({ renew, watch, live: () => [], log })
    const i = info({ durMs: 400 }); watcher(i); i.ctx.currentTime = 1.6
    await vi.advanceTimersByTimeAsync(700)
    expect(renew).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/ended не пришёл за 700 мс/)
  })
  it('микрофон уже слушает (живой захват) — обновление не повторяем, только журнал', async () => {
    const renew = vi.fn()
    armOutputCheck({ renew, watch, live: () => [{ kind: 'capture' }], log })
    watcher(info())
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    expect(renew).not.toHaveBeenCalled(); expect(log.mock.calls[0][0]).toMatch(/микрофон уже слушает/)
  })
  it('звук так и не стартовал — наблюдение снимается через WATCH_MS; отмена снимает всё', async () => {
    armOutputCheck({ renew: vi.fn(), watch, live: () => [], log })
    await vi.advanceTimersByTimeAsync(WATCH_MS)
    expect(watcher).toBeNull()
    const off = armOutputCheck({ renew: vi.fn(), watch, live: () => [], log }); off(); expect(watcher).toBeNull()
  })
})

describe('gameBufferPlay.watchNextStart', () => {
  it('разовый: следующий стартовавший звук → { ctx, t0, durMs, ended, replay }; replay играет тот же буфер заново', () => {
    const fake = makeFakeWebAudio({ state: 'running' })
    vi.stubGlobal('AudioContext', fake.Ctx); vi.stubGlobal('localStorage', store())
    const got = []
    watchNextStart(x => got.push(x))
    const buf = { duration: 2 }
    const onStart = vi.fn()
    playGameBuffer(buf, { rate: 2, onStart }); playGameBuffer(buf)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ t0: 1.5, durMs: 1000 }); expect(got[0].ended()).toBe(false)
    fake.sources[0].onended?.()
    expect(got[0].ended()).toBe(true)
    got[0].replay()
    expect(fake.sources).toHaveLength(3); expect(fake.sources[2].rate).toBe(2); expect(onStart).toHaveBeenCalledTimes(2)
  })
})
