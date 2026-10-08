import { describe, it, expect, vi } from 'vitest'
import { shareInFlight } from './shareInFlight.js'

function deferred() {
  let resolve, reject
  const p = new Promise((res, rej) => { resolve = res; reject = rej })
  return { p, resolve, reject }
}

describe('shareInFlight', () => {
  it('одновременные вызовы получают один запрос', async () => {
    const d = deferred()
    const fn = vi.fn(() => d.p)
    let t = 0
    const shared = shareInFlight(fn, 1500, () => t)
    const a = shared(); const b = shared()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    d.resolve([1])
    expect(await a).toEqual([1])
  })

  it('после завершения следующий вызов идёт заново (кэша нет)', async () => {
    const fn = vi.fn(() => Promise.resolve(1))
    const shared = shareInFlight(fn, 1500, () => 0)
    await shared()
    await Promise.resolve()
    await shared()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('после ошибки тоже идёт заново', async () => {
    const fn = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('x')))
      .mockImplementationOnce(() => Promise.resolve(2))
    const shared = shareInFlight(fn, 1500, () => 0)
    await expect(shared()).rejects.toThrow('x')
    await Promise.resolve()
    expect(await shared()).toBe(2)
  })

  it('запрос старше maxAgeMs не склеивается, даже если ещё в полёте', () => {
    const d = deferred()
    const fn = vi.fn(() => d.p)
    let t = 0
    const shared = shareInFlight(fn, 1500, () => t)
    shared()
    t = 1499; shared()
    expect(fn).toHaveBeenCalledTimes(1)
    t = 1500; shared()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
