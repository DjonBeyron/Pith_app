import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startIdlePrewarm, isSlowConnection, START_DELAY, GAP } from './idlePrewarm.js'

// Окружение-пустышка: окно с событиями и документ с видимостью
function makeEnv({ gone = true, idle = false, visibility = 'visible', connection = null } = {}) {
  const wl = {}
  const dl = {}
  const w = {
    __pithySplashGone: gone,
    addEventListener: (n, f) => { (wl[n] ||= []).push(f) },
    removeEventListener: (n, f) => { wl[n] = (wl[n] || []).filter(x => x !== f) },
    ...(idle ? { requestIdleCallback: fn => setTimeout(fn, 0), cancelIdleCallback: id => clearTimeout(id) } : {}),
  }
  const doc = {
    visibilityState: visibility,
    addEventListener: (n, f) => { (dl[n] ||= []).push(f) },
    removeEventListener: (n, f) => { dl[n] = (dl[n] || []).filter(x => x !== f) },
  }
  return {
    env: { window: w, document: doc, connection },
    fireWindow: n => (wl[n] || []).slice().forEach(f => f()),
    fireDoc: n => (dl[n] || []).slice().forEach(f => f()),
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('isSlowConnection', () => {
  it('режим экономии и 2g — слабая сеть', () => {
    expect(isSlowConnection({ saveData: true })).toBe(true)
    expect(isSlowConnection({ effectiveType: '2g' })).toBe(true)
    expect(isSlowConnection({ effectiveType: 'slow-2g' })).toBe(true)
  })
  it('3g/4g и отсутствие API (Safari) — не слабая', () => {
    expect(isSlowConnection({ effectiveType: '3g' })).toBe(false)
    expect(isSlowConnection({ effectiveType: '4g', saveData: false })).toBe(false)
    expect(isSlowConnection(undefined)).toBe(false)
  })
})

describe('startIdlePrewarm', () => {
  it('ничего не качает раньше START_DELAY, потом по одной задаче с паузой', () => {
    const { env } = makeEnv()
    const a = vi.fn(); const b = vi.fn()
    startIdlePrewarm([a, b], env)
    vi.advanceTimersByTime(START_DELAY - 1)
    expect(a).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1 + 300)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GAP + 300)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('ждёт ухода сплэша', () => {
    const { env, fireWindow } = makeEnv({ gone: false })
    const a = vi.fn()
    startIdlePrewarm([a], env)
    vi.advanceTimersByTime(60000)
    expect(a).not.toHaveBeenCalled()
    fireWindow('pithy:splash-gone')
    vi.advanceTimersByTime(START_DELAY + 300)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('на слабой сети не запускает ничего', () => {
    const { env } = makeEnv({ connection: { effectiveType: '2g' } })
    const a = vi.fn()
    startIdlePrewarm([a], env)
    vi.advanceTimersByTime(60000)
    expect(a).not.toHaveBeenCalled()
  })

  it('в фоне ждёт возврата вкладки', () => {
    const { env, fireDoc } = makeEnv({ visibility: 'hidden' })
    const a = vi.fn()
    startIdlePrewarm([a], env)
    vi.advanceTimersByTime(60000)
    expect(a).not.toHaveBeenCalled()
    env.document.visibilityState = 'visible'
    fireDoc('visibilitychange')
    vi.advanceTimersByTime(300)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('использует requestIdleCallback, если он есть', () => {
    const { env } = makeEnv({ idle: true })
    const a = vi.fn()
    startIdlePrewarm([a], env)
    vi.advanceTimersByTime(START_DELAY + 1)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('упавшая задача (sync и async) не ломает очередь', async () => {
    const { env } = makeEnv()
    const bad = vi.fn(() => { throw new Error('x') })
    const rej = vi.fn(() => Promise.reject(new Error('y')))
    const ok = vi.fn()
    startIdlePrewarm([bad, rej, ok], env)
    await vi.advanceTimersByTimeAsync(START_DELAY + 300 + (GAP + 300) * 2)
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('отмена останавливает очередь', () => {
    const { env } = makeEnv()
    const a = vi.fn()
    const stop = startIdlePrewarm([a], env)
    stop()
    vi.advanceTimersByTime(60000)
    expect(a).not.toHaveBeenCalled()
  })
})
