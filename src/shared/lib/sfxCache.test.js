import { describe, it, expect, vi, beforeEach } from 'vitest'
import { warmSfx, sfxBlobUrl, sfxBytes, sfxIsReady, sfxBlocking, onSfxReady, onSfxSettled, resetSfxCacheForTests, SFX_HEAD_START_MS } from './sfxCache.js'

const res = (n, ok = true) => ({ ok, status: ok ? 200 : 404, blob: async () => new Blob([new Uint8Array(n)]), clone() { return res(n, ok) } })
const makeCaches = () => {
  const store = new Map()
  const cache = { match: async u => store.get(u), put: async (u, r) => { store.set(u, r) } }
  return { store, api: { open: async () => cache, keys: async () => [], delete: async () => true } }
}

describe('sfxCache: звуки интерфейса в памяти и Cache Storage', () => {
  beforeEach(() => { resetSfxCacheForTests(); vi.unstubAllGlobals() })

  it('сеть → память + Cache Storage; повторный запуск берёт из кэша без сети; высокий приоритет запроса', async () => {
    const { store, api } = makeCaches()
    vi.stubGlobal('caches', api)
    const fetchFn = vi.fn(async () => res(2048))
    const ready = []
    onSfxReady(n => ready.push(n))
    await warmSfx(['answer-correct', 'message-in'], { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ priority: 'high' })
    expect(sfxIsReady('answer-correct')).toBe(true)
    expect(ready.sort()).toEqual(['answer-correct', 'message-in'])
    expect(store.size).toBe(2)
    expect((await sfxBytes('answer-correct')).byteLength).toBe(2048)
    resetSfxCacheForTests()
    const fetch2 = vi.fn()
    await warmSfx(['answer-correct'], { fetchFn: fetch2 })
    expect(fetch2).not.toHaveBeenCalled() // из Cache Storage
    expect(sfxIsReady('answer-correct')).toBe(true)
  })

  it('ошибка одного звука не останавливает остальные; без Cache Storage всё равно работает из памяти', async () => {
    const fetchFn = vi.fn(async u => (u.includes('xp-gain') ? res(1, false) : res(10)))
    await warmSfx(['xp-gain', 'level-up'], { fetchFn })
    expect(sfxIsReady('xp-gain')).toBe(false)
    expect(sfxIsReady('level-up')).toBe(true)
    expect(sfxBytes('xp-gain')).toBeNull()
  })

  it('sfxBlocking: пока идёт прогрев и срок головного старта не вышел — медиа ждут; потом нет; onSfxSettled срабатывает по окончании', async () => {
    let release
    const fetchFn = vi.fn(() => new Promise(r => { release = () => r(res(5)) }))
    const p = warmSfx(['message-in'], { fetchFn })
    expect(sfxBlocking()).toBe(true)
    expect(sfxBlocking(Date.now() + SFX_HEAD_START_MS + 1)).toBe(false) // слишком долго — медиа не ждут
    const done = vi.fn()
    onSfxSettled(done)
    await Promise.resolve(); await Promise.resolve()
    release()
    await p
    expect(done).toHaveBeenCalledTimes(1)
    expect(sfxBlocking()).toBe(false)
    const again = vi.fn(); onSfxSettled(again)
    expect(again).toHaveBeenCalledTimes(1) // прогрев уже не идёт — сразу
  })

  it('sfxBlobUrl: blob-адрес один на звук, пока звука нет — null', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x') })
    expect(sfxBlobUrl('typing-1')).toBeNull()
    await warmSfx(['typing-1'], { fetchFn: async () => res(3) })
    expect(sfxBlobUrl('typing-1')).toBe('blob:x')
    expect(sfxBlobUrl('typing-1')).toBe('blob:x')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
})
