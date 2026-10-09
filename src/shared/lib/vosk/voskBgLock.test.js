import { describe, it, expect, vi } from 'vitest'
import { acquireLock, LOCK_KEY, STALE_MS, BEAT_MS } from './voskBgLock.js'

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), _m: m } }
// Подставной navigator.locks: ifAvailable — замок выдаётся, только если свободен; держится, пока callback не завершится
function fakeLocks() {
  const held = new Set()
  return { request: (name, _o, cb) => {
    if (held.has(name)) return Promise.resolve(cb(null))
    held.add(name)
    return Promise.resolve(cb({ name })).finally(() => held.delete(name))
  } }
}

describe('защита от двойного запуска: Web Locks', () => {
  it('первая вкладка берёт замок, вторая получает null, после release замок снова свободен', async () => {
    const nav = { locks: fakeLocks() }
    const release = await acquireLock({ nav })
    expect(typeof release).toBe('function')
    expect(await acquireLock({ nav })).toBeNull()
    release()
    await Promise.resolve()
    const again = await acquireLock({ nav })
    expect(typeof again).toBe('function')
    again()
  })
  it('сбой Web Locks не валит загрузку — просто «замка нет»', async () => {
    expect(await acquireLock({ nav: { locks: { request: () => { throw new Error('x') } } } })).toBeNull()
    expect(await acquireLock({ nav: { locks: { request: () => Promise.reject(new Error('x')) } } })).toBeNull()
  })
})

describe('защита от двойного запуска: метка в localStorage', () => {
  it('одна вкладка держит метку, вторая не может; release снимает только свою метку', async () => {
    const store = mem(), nav = {}
    let t = 1000
    const a = await acquireLock({ nav, store, id: 'A', now: () => t, setTimer: () => 1, clearTimer: () => {} })
    expect(JSON.parse(store.getItem(LOCK_KEY)).id).toBe('A')
    expect(await acquireLock({ nav, store, id: 'B', now: () => t + 1000, setTimer: () => 2, clearTimer: () => {} })).toBeNull()
    a()
    expect(store.getItem(LOCK_KEY)).toBeNull()
    const b = await acquireLock({ nav, store, id: 'B', now: () => t, setTimer: () => 2, clearTimer: () => {} })
    expect(typeof b).toBe('function')
  })
  it('брошенная метка (вкладку выгрузили, пульса нет) старше 20 с — перехватываем', async () => {
    const store = mem()
    store.setItem(LOCK_KEY, JSON.stringify({ id: 'dead', t: 0 }))
    expect(await acquireLock({ nav: {}, store, id: 'B', now: () => STALE_MS - 1, setTimer: () => 1, clearTimer: () => {} })).toBeNull()
    expect(typeof await acquireLock({ nav: {}, store, id: 'B', now: () => STALE_MS + 1, setTimer: () => 1, clearTimer: () => {} })).toBe('function')
  })
  it('пока держим, метка обновляется раз в 5 с; после release таймер остановлен', async () => {
    const store = mem()
    let t = 0, beat
    const clear = vi.fn()
    const rel = await acquireLock({ nav: {}, store, id: 'A', now: () => t, setTimer: (fn, ms) => { beat = fn; expect(ms).toBe(BEAT_MS); return 7 }, clearTimer: clear })
    t = 5000; beat()
    expect(JSON.parse(store.getItem(LOCK_KEY)).t).toBe(5000)
    rel()
    expect(clear).toHaveBeenCalledWith(7)
  })
  it('нет ни замков, ни хранилища — работаем без защиты (не блокируем загрузку)', async () => {
    const rel = await acquireLock({ nav: {}, store: null })
    expect(typeof rel === 'function' || rel === null).toBe(true)
  })
})
